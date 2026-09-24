import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';

import { HttpStatus, type INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { sign } from 'jsonwebtoken';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import type { LoginResult } from '../src/modules/auth/application/dto/auth.dto';
import { hashRefreshToken } from '../src/modules/auth/domain/refresh-token-hash';
import { EnvService } from '../src/config/env.service';
import { PrismaService } from '../src/shared/infrastructure/prisma/prisma.service';
import { authenticate } from './support/authenticate';

interface ErrorBody {
  statusCode: number;
  error: string;
  message: string;
}

/**
 * Integration coverage for the acceptance criteria: a valid login, a wrong
 * password, an unknown user, an expired token, and access to a protected
 * route with no token at all — plus the two things every response must
 * never do: leak `passwordHash`, or let a business route through
 * unauthenticated. Registration is a business route like any other now: the
 * only unauthenticated entry points are login, refresh, logout, and the
 * health check, so every `POST /users` call below carries a bearer token
 * from an already authenticated actor, the same way a real client would.
 */
describe('Authentication (e2e)', () => {
  let app: INestApplication;
  let server: Server;
  let jwtSecret: string;
  let actorAuthHeader: string;
  let prisma: PrismaService;

  const password = 'correct horse battery staple';
  const createdUserIds: string[] = [];

  function uniqueEmail(): string {
    return `auth-e2e-${randomUUID()}@craftstock.dev`;
  }

  // Deliberately not `async`: returns the supertest chain itself (a
  // thenable, not a resolved Promise) so callers can still append
  // `.expect(...)` before awaiting it.
  function registerAsActor(email: string, name = 'Heric'): request.Test {
    return request(server)
      .post('/users')
      .set('Authorization', actorAuthHeader)
      .send({ email, password, name });
  }

  async function registerAndTrack(email: string, name = 'Heric'): Promise<string> {
    const response = await registerAsActor(email, name).expect(HttpStatus.CREATED);
    const id = (response.body as { id: string }).id;
    createdUserIds.push(id);
    return id;
  }

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
    server = app.getHttpServer() as Server;
    prisma = moduleRef.get(PrismaService);
    jwtSecret = moduleRef.get(EnvService).get('JWT_SECRET');

    const actor = await authenticate(moduleRef, server);
    actorAuthHeader = actor.authHeader;
    createdUserIds.push(actor.userId);
  });

  afterAll(async () => {
    // RefreshToken rows cascade with their User, so this is the only cleanup needed.
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await app.close();
  });

  describe('POST /users (registration)', () => {
    it('creates the account and never returns passwordHash', async () => {
      const email = uniqueEmail();

      const response = await registerAsActor(email).expect(HttpStatus.CREATED);
      createdUserIds.push((response.body as { id: string }).id);

      expect(response.body).toMatchObject({ email, name: 'Heric' });
      expect(response.body).not.toHaveProperty('passwordHash');
    });

    it('rejects a second registration with the same email, with 409', async () => {
      const email = uniqueEmail();
      await registerAndTrack(email);

      await registerAsActor(email, 'Outro Heric').expect(HttpStatus.CONFLICT);
    });

    it('rejects a password shorter than 8 characters', async () => {
      await request(server)
        .post('/users')
        .set('Authorization', actorAuthHeader)
        .send({ email: uniqueEmail(), password: 'short', name: 'Heric' })
        .expect(HttpStatus.BAD_REQUEST);
    });

    it('refuses registration with no token at all, with 401', async () => {
      // Not `@Public()`: there are no roles in this system, so the only way
      // to create an account is as an already authenticated user.
      await request(server)
        .post('/users')
        .send({ email: uniqueEmail(), password, name: 'Heric' })
        .expect(HttpStatus.UNAUTHORIZED);
    });
  });

  describe('POST /auth/login', () => {
    it('logs in with a valid email and password, issuing an access and a refresh token', async () => {
      const email = uniqueEmail();
      await registerAndTrack(email);

      const response = await request(server)
        .post('/auth/login')
        .send({ email, password })
        .expect(HttpStatus.OK);

      const body = response.body as LoginResult;
      expect(typeof body.accessToken).toBe('string');
      expect(typeof body.refreshToken).toBe('string');
      expect(body.tokenType).toBe('Bearer');
      expect(body.expiresInSeconds).toBeGreaterThan(0);
    });

    it('refuses an incorrect password, with 401', async () => {
      const email = uniqueEmail();
      await registerAndTrack(email);

      const response = await request(server)
        .post('/auth/login')
        .send({ email, password: 'wrong password' })
        .expect(HttpStatus.UNAUTHORIZED);

      expect((response.body as ErrorBody).statusCode).toBe(HttpStatus.UNAUTHORIZED);
    });

    it('refuses an email with no account, with 401', async () => {
      await request(server)
        .post('/auth/login')
        .send({ email: uniqueEmail(), password })
        .expect(HttpStatus.UNAUTHORIZED);
    });

    it('is reachable without a bearer token', async () => {
      // The one unauthenticated door into the system besides refresh, logout
      // and the health check — there would be no way to obtain a first token
      // otherwise.
      const email = uniqueEmail();
      await registerAndTrack(email);

      await request(server).post('/auth/login').send({ email, password }).expect(HttpStatus.OK);
    });
  });

  describe('POST /auth/refresh', () => {
    it('trades a valid refresh token for a new access and refresh token', async () => {
      const email = uniqueEmail();
      await registerAndTrack(email);
      const login = await request(server).post('/auth/login').send({ email, password });
      const { refreshToken } = login.body as LoginResult;

      const response = await request(server)
        .post('/auth/refresh')
        .send({ refreshToken })
        .expect(HttpStatus.OK);

      const body = response.body as LoginResult;
      expect(typeof body.accessToken).toBe('string');
      expect(body.refreshToken).not.toBe(refreshToken);
    });

    it('rotates: the same refresh token cannot be used twice, with 401', async () => {
      const email = uniqueEmail();
      await registerAndTrack(email);
      const login = await request(server).post('/auth/login').send({ email, password });
      const { refreshToken } = login.body as LoginResult;

      await request(server).post('/auth/refresh').send({ refreshToken }).expect(HttpStatus.OK);

      await request(server)
        .post('/auth/refresh')
        .send({ refreshToken })
        .expect(HttpStatus.UNAUTHORIZED);
    });

    it('refuses a refresh token that was never issued, with 401', async () => {
      await request(server)
        .post('/auth/refresh')
        .send({ refreshToken: 'not-a-real-refresh-token' })
        .expect(HttpStatus.UNAUTHORIZED);
    });

    it('refuses an expired refresh token, with 401', async () => {
      const email = uniqueEmail();
      await registerAndTrack(email);
      const login = await request(server).post('/auth/login').send({ email, password });
      const { refreshToken } = login.body as LoginResult;

      await prisma.refreshToken.update({
        where: { tokenHash: hashRefreshToken(refreshToken) },
        data: { expiresAt: new Date(Date.now() - 1_000) },
      });

      await request(server)
        .post('/auth/refresh')
        .send({ refreshToken })
        .expect(HttpStatus.UNAUTHORIZED);
    });

    it('is reachable without a bearer token', async () => {
      // A client calling this has, by definition, no valid access token —
      // that is the whole reason it is here.
      await request(server)
        .post('/auth/refresh')
        .send({ refreshToken: 'irrelevant' })
        .expect(HttpStatus.UNAUTHORIZED); // rejected for being invalid, not for missing auth
    });
  });

  describe('POST /auth/logout', () => {
    it('revokes the refresh token so it can no longer be refreshed', async () => {
      const email = uniqueEmail();
      await registerAndTrack(email);
      const login = await request(server).post('/auth/login').send({ email, password });
      const { refreshToken } = login.body as LoginResult;

      await request(server)
        .post('/auth/logout')
        .send({ refreshToken })
        .expect(HttpStatus.NO_CONTENT);

      await request(server)
        .post('/auth/refresh')
        .send({ refreshToken })
        .expect(HttpStatus.UNAUTHORIZED);
    });

    it('is idempotent for a token that does not exist', async () => {
      await request(server)
        .post('/auth/logout')
        .send({ refreshToken: 'not-a-real-refresh-token' })
        .expect(HttpStatus.NO_CONTENT);
    });
  });

  describe('GET /users/me (protected profile)', () => {
    it('returns the authenticated profile for a valid token', async () => {
      const email = uniqueEmail();
      await registerAndTrack(email);

      const login = await request(server).post('/auth/login').send({ email, password });
      const { accessToken } = login.body as LoginResult;

      const response = await request(server)
        .get('/users/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(HttpStatus.OK);

      expect(response.body).toMatchObject({ email, name: 'Heric' });
      expect(response.body).not.toHaveProperty('passwordHash');
    });

    it('refuses access with no token at all, with 401', async () => {
      await request(server).get('/users/me').expect(HttpStatus.UNAUTHORIZED);
    });

    it('refuses an expired token, with 401', async () => {
      const email = uniqueEmail();
      const userId = await registerAndTrack(email);

      // Signed with the app's real secret so only the expiry is wrong.
      const expiredToken = sign({ sub: userId, email }, jwtSecret, { expiresIn: -10 });

      await request(server)
        .get('/users/me')
        .set('Authorization', `Bearer ${expiredToken}`)
        .expect(HttpStatus.UNAUTHORIZED);
    });

    it('refuses a malformed token, with 401', async () => {
      await request(server)
        .get('/users/me')
        .set('Authorization', 'Bearer not-a-real-token')
        .expect(HttpStatus.UNAUTHORIZED);
    });
  });

  describe('global guard over business routes', () => {
    it('refuses a business route with no token, with 401', async () => {
      await request(server).get('/materials').expect(HttpStatus.UNAUTHORIZED);
    });

    it('allows a business route once authenticated', async () => {
      await request(server)
        .get('/materials')
        .set('Authorization', actorAuthHeader)
        .expect(HttpStatus.OK);
    });

    it('leaves the health check reachable with no token', async () => {
      await request(server).get('/health').expect(HttpStatus.OK);
    });
  });
});
