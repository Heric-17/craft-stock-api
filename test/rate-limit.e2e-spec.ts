import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';

import { HttpStatus, type INestApplication } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { validateEnv, type Env } from '../src/config/env.schema';
import { EnvService } from '../src/config/env.service';
import { UsersService } from '../src/modules/users/application/services/users.service';
import { NOTIFICATION_SENDER_FACTORY } from '../src/shared/domain/notifications/notification-sender';
import type { RateLimitExceededDetails } from '../src/shared/domain/errors/rate-limit-exceeded.error';
import { PrismaService } from '../src/shared/infrastructure/prisma/prisma.service';
import type { ErrorResponseBody } from '../src/shared/presentation/filters/all-exceptions.filter';
import { configureTestApp } from './support/configure-test-app';
import { api } from './support/api';

const PASSWORD = 'correct horse battery staple';

/**
 * An application whose environment is the process one with `env` laid over it.
 *
 * Done by replacing `EnvService` and not by editing `process.env`:
 * `ConfigModule` reads the process environment once, when `AppModule` is first
 * imported, long before a test could change it. The values still go through
 * `validateEnv`, so a budget this spec writes is held to the same rules as one
 * in a real `.env`. `global-setup.ts` leaves the limits out of the way for
 * every other spec; the tight budgets here are this spec's own.
 */
async function createApp(
  env: Record<string, string | undefined>,
  sentAlerts: { subject: string; body: string }[] = [],
): Promise<INestApplication> {
  const merged: Record<string, unknown> = { ...process.env, ...env };

  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) {
      delete merged[key];
    }
  }

  const validated = validateEnv(merged);
  const config = { get: (key: keyof Env) => validated[key] } as unknown as ConfigService<Env, true>;

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(EnvService)
    .useValue(new EnvService(config))
    .overrideProvider(NOTIFICATION_SENDER_FACTORY)
    .useValue({
      create: () => ({
        send: (subject: string, body: string): Promise<void> => {
          sentAlerts.push({ subject, body });
          return Promise.resolve();
        },
      }),
    })
    .compile();

  const app = moduleRef.createNestApplication();
  configureTestApp(app, moduleRef);
  await app.init();

  return app;
}

/** The structured log lines the application writes while `action` runs. */
async function captureLog(action: () => Promise<void>): Promise<Record<string, unknown>[]> {
  const lines: string[] = [];
  const write = process.stdout.write.bind(process.stdout);

  process.stdout.write = (chunk: string | Uint8Array, ...rest: unknown[]) => {
    lines.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8'));
    return (write as (...args: unknown[]) => boolean)(chunk, ...rest);
  };

  try {
    await action();
  } finally {
    process.stdout.write = write;
  }

  return lines
    .flatMap((chunk) => chunk.split('\n'))
    .filter((line) => line.startsWith('{'))
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

describe('Rate limiting (e2e)', () => {
  describe('the budgets', () => {
    let app: INestApplication;
    let server: Server;
    let prisma: PrismaService;
    const sentAlerts: { subject: string; body: string }[] = [];
    const createdUserIds: string[] = [];

    async function createUser(): Promise<string> {
      const email = `rate-limit-e2e-${randomUUID()}@craftstock.dev`;
      const user = await app.get(UsersService).register({
        email,
        password: PASSWORD,
        name: 'Rate Limit E2E User',
      });
      createdUserIds.push(user.id);
      return email;
    }

    function login(email: string, password: string): request.Test {
      return api(server).post('/auth/login').send({ email, password });
    }

    beforeAll(async () => {
      app = await createApp(
        {
          RATE_LIMIT_AUTH_LIMIT: '3',
          RATE_LIMIT_AUTH_WINDOW_SECONDS: '60',
          RATE_LIMIT_RECOVERY_LIMIT: '2',
          RATE_LIMIT_RECOVERY_WINDOW_SECONDS: '3600',
          RATE_LIMIT_DEFAULT_LIMIT: '5',
          RATE_LIMIT_DEFAULT_WINDOW_SECONDS: '60',
        },
        sentAlerts,
      );
      server = app.getHttpServer() as Server;
      prisma = app.get(PrismaService);
    });

    afterAll(async () => {
      for (const userId of createdUserIds) {
        await prisma.refreshToken.deleteMany({ where: { userId } });
        await prisma.user.deleteMany({ where: { id: userId } });
      }
      await app.close();
    });

    it('lets the attempts below the limit through and refuses the next with a 429 in the error contract', async () => {
      const email = await createUser();

      for (let attempt = 0; attempt < 3; attempt += 1) {
        await login(email, 'not the password').expect(HttpStatus.UNAUTHORIZED);
      }

      const before = Date.now();
      const refused = await login(email, 'not the password').expect(HttpStatus.TOO_MANY_REQUESTS);
      const body = refused.body as ErrorResponseBody;
      const details = body.details as RateLimitExceededDetails;

      expect(body).toMatchObject({
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        code: 'RATE_LIMIT_EXCEEDED',
        error: 'RateLimitExceededError',
      });
      expect(body.errorId).toBeUndefined();
      expect(body.correlationId).toBeTruthy();

      expect(Number.isInteger(details.retryAfterSeconds)).toBe(true);
      expect(details.retryAfterSeconds).toBeGreaterThan(0);
      expect(details.retryAfterSeconds).toBeLessThanOrEqual(60);

      const retryAt = new Date(details.retryAt).getTime();
      expect(retryAt).toBeGreaterThanOrEqual(before + (details.retryAfterSeconds - 1) * 1_000);
      expect(retryAt).toBeLessThanOrEqual(Date.now() + details.retryAfterSeconds * 1_000);

      expect(refused.headers['retry-after']).toBe(String(details.retryAfterSeconds));

      // Nor does the right password get through while the wait lasts, which
      // would otherwise tell a script that its last guess was the one.
      await login(email, PASSWORD).expect(HttpStatus.TOO_MANY_REQUESTS);
    });

    it('counts a route on its own: exhausting the login does not touch the refresh route', async () => {
      // `/auth/login` is spent by the tests above, from this same address.
      await api(server).post('/auth/refresh').expect(HttpStatus.UNAUTHORIZED);
    });

    it('limits the password recovery routes to their own, stricter budget', async () => {
      const forgot = (): request.Test =>
        api(server).post('/auth/forgot-password').send({ email: 'nobody@craftstock.dev' });

      await forgot().expect(HttpStatus.NO_CONTENT);
      await forgot().expect(HttpStatus.NO_CONTENT);

      const refused = await forgot().expect(HttpStatus.TOO_MANY_REQUESTS);
      expect((refused.body as ErrorResponseBody).code).toBe('RATE_LIMIT_EXCEEDED');

      // Also counted before validation: a script need not send a well-formed body.
      const reset = (): request.Test => api(server).post('/auth/reset-password').send({});
      expect((await reset()).status).not.toBe(HttpStatus.TOO_MANY_REQUESTS);
      expect((await reset()).status).not.toBe(HttpStatus.TOO_MANY_REQUESTS);
      await reset().expect(HttpStatus.TOO_MANY_REQUESTS);
    });

    it('holds every other route to the default budget, ahead of the authentication guard', async () => {
      for (let attempt = 0; attempt < 5; attempt += 1) {
        await api(server).get('/materials').expect(HttpStatus.UNAUTHORIZED);
      }

      // 429 and not 401: a flood of requests with no token is turned away
      // before anything looks at the token.
      await api(server).get('/materials').expect(HttpStatus.TOO_MANY_REQUESTS);
    });

    it('never limits the health check', async () => {
      for (let attempt = 0; attempt < 20; attempt += 1) {
        await request(server).get('/health').expect(HttpStatus.OK);
      }
    });

    it('logs the refusal once with the route and the address, and raises no alert', async () => {
      const email = await createUser();
      // The login budget was spent by the tests above, from this same address.
      const lines = await captureLog(async () => {
        await login(email, 'not the password').expect(HttpStatus.TOO_MANY_REQUESTS);
      });

      const refusals = lines.filter((line) => String(line.message).startsWith('Rate limit'));
      expect(refusals).toHaveLength(1);
      expect(refusals[0]).toMatchObject({
        level: 'warn',
        context: 'RateLimit',
        details: [
          expect.objectContaining({
            event: 'rate_limit_exceeded',
            route: '/api/auth/login',
            method: 'POST',
            trustProxy: 0,
            socketAddress: expect.stringMatching(/127\.0\.0\.1$/) as unknown,
            ip: expect.stringMatching(/127\.0\.0\.1$/) as unknown,
          }) as unknown,
        ],
      });

      // The filter does not add a second line for the same refusal.
      expect(lines.filter((line) => String(line.message).includes('429'))).toHaveLength(0);
      expect(sentAlerts).toEqual([]);
    });
  });

  describe('behind a reverse proxy (TRUST_PROXY=1)', () => {
    let app: INestApplication;
    let server: Server;

    beforeAll(async () => {
      app = await createApp({
        TRUST_PROXY: '1',
        RATE_LIMIT_AUTH_LIMIT: '2',
        RATE_LIMIT_AUTH_WINDOW_SECONDS: '60',
      });
      server = app.getHttpServer() as Server;
    });

    afterAll(async () => {
      await app.close();
    });

    const loginFrom = (forwardedFor: string): request.Test =>
      api(server)
        .post('/auth/login')
        .set('X-Forwarded-For', forwardedFor)
        .send({ email: 'nobody@craftstock.dev', password: PASSWORD });

    it('counts each client under the address the proxy forwarded, not under the proxy', async () => {
      await loginFrom('203.0.113.10').expect(HttpStatus.UNAUTHORIZED);
      await loginFrom('203.0.113.10').expect(HttpStatus.UNAUTHORIZED);
      await loginFrom('203.0.113.10').expect(HttpStatus.TOO_MANY_REQUESTS);

      // Same proxy, another client: untouched by the first one's wait.
      await loginFrom('203.0.113.11').expect(HttpStatus.UNAUTHORIZED);
    });

    it('ignores the entries a client prepends to the header itself', async () => {
      // The proxy appends the address it saw, so only the last entry is its
      // word; the first two are whatever the client wrote.
      await loginFrom('198.51.100.1, 203.0.113.20').expect(HttpStatus.UNAUTHORIZED);
      await loginFrom('198.51.100.2, 203.0.113.20').expect(HttpStatus.UNAUTHORIZED);
      await loginFrom('198.51.100.3, 203.0.113.20').expect(HttpStatus.TOO_MANY_REQUESTS);
    });
  });

  /**
   * The chains below are the two shapes the Render service actually produced,
   * with the client's address replaced by a documentation one: five entries
   * through two Cloudflare hops, and three through one. No count fits both,
   * which is why the proxies are named by address instead.
   */
  describe('behind proxies known by address (TRUST_PROXY=loopback,uniquelocal,cloudflare)', () => {
    let app: INestApplication;
    let server: Server;

    const LONG_CHAIN = '162.158.41.232, 162.158.41.232, 10.29.169.249, 10.25.15.2';
    const SHORT_CHAIN = '162.158.41.72, 10.25.15.2';

    beforeAll(async () => {
      app = await createApp({
        TRUST_PROXY: 'loopback,uniquelocal,cloudflare',
        RATE_LIMIT_AUTH_LIMIT: '2',
        RATE_LIMIT_AUTH_WINDOW_SECONDS: '60',
      });
      server = app.getHttpServer() as Server;
    });

    afterAll(async () => {
      await app.close();
    });

    const loginFrom = (forwardedFor: string): request.Test =>
      api(server)
        .post('/auth/login')
        .set('X-Forwarded-For', forwardedFor)
        .send({ email: 'nobody@craftstock.dev', password: PASSWORD });

    it('finds the same client at the end of a long chain and of a short one', async () => {
      await loginFrom(`203.0.113.60, ${LONG_CHAIN}`).expect(HttpStatus.UNAUTHORIZED);
      await loginFrom(`203.0.113.60, ${SHORT_CHAIN}`).expect(HttpStatus.UNAUTHORIZED);
      await loginFrom(`203.0.113.60, ${LONG_CHAIN}`).expect(HttpStatus.TOO_MANY_REQUESTS);
    });

    it('does not count one client against the others behind the same edge', async () => {
      await loginFrom(`203.0.113.61, ${LONG_CHAIN}`).expect(HttpStatus.UNAUTHORIZED);
    });

    it('does not let a client choose its address, whatever the length of the chain', async () => {
      // 203.0.113.60 is spent above; a different leading entry must not
      // reach a fresh counter, on the long chain or on the short one, which
      // is where a fixed proxy count ran past the real entries.
      await loginFrom(`1.2.3.4, 203.0.113.60, ${LONG_CHAIN}`).expect(HttpStatus.TOO_MANY_REQUESTS);
      await loginFrom(`5.6.7.8, 203.0.113.60, ${SHORT_CHAIN}`).expect(HttpStatus.TOO_MANY_REQUESTS);
    });
  });

  describe('with no proxy configured (the default)', () => {
    let app: INestApplication;
    let server: Server;

    beforeAll(async () => {
      app = await createApp({
        TRUST_PROXY: undefined,
        RATE_LIMIT_AUTH_LIMIT: '2',
        RATE_LIMIT_AUTH_WINDOW_SECONDS: '60',
      });
      server = app.getHttpServer() as Server;
    });

    afterAll(async () => {
      await app.close();
    });

    it('does not let a client pick its own address through X-Forwarded-For', async () => {
      const loginFrom = (forwardedFor: string): request.Test =>
        api(server)
          .post('/auth/login')
          .set('X-Forwarded-For', forwardedFor)
          .send({ email: 'nobody@craftstock.dev', password: PASSWORD });

      await loginFrom('203.0.113.30').expect(HttpStatus.UNAUTHORIZED);
      await loginFrom('203.0.113.31').expect(HttpStatus.UNAUTHORIZED);
      await loginFrom('203.0.113.32').expect(HttpStatus.TOO_MANY_REQUESTS);
    });
  });
});
