import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';

import { HttpStatus, type INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import type { SessionResponse } from '../src/modules/auth/application/dto/auth.dto';
import { REFRESH_TOKEN_COOKIE } from '../src/modules/auth/presentation/refresh-token-cookie';
import { UsersService } from '../src/modules/users/application/services/users.service';
import { PrismaService } from '../src/shared/infrastructure/prisma/prisma.service';
import type { ErrorResponseBody } from '../src/shared/presentation/filters/all-exceptions.filter';
import { configureTestApp } from './support/configure-test-app';
import {
  parseRefreshCookie,
  refreshCookieHeader,
  requireRefreshToken,
} from './support/refresh-cookie';

/**
 * The session transport, end to end.
 *
 * Why these assertions and not a simpler "login works": each attribute of
 * the cookie is load-bearing in a way that fails silently if it regresses.
 * A missing `HttpOnly` hands the 30-day credential to any XSS. A wrong
 * `Path` means the browser never sends the cookie, so the session stops
 * surviving a reload with nothing in any log. A `refreshToken` that creeps
 * back into a response body puts it where `localStorage` can reach it. None
 * of those break a test that only checks for a 200.
 */
describe('Session cookie (e2e)', () => {
  let app: INestApplication;
  let server: Server;
  let prisma: PrismaService;

  const password = 'correct horse battery staple';
  const createdUserIds: string[] = [];

  async function registerAndLogin(): Promise<request.Response> {
    const email = `cookie-e2e-${randomUUID()}@craftstock.dev`;
    const user = await app.get(UsersService).register({ email, password, name: 'Heric' });
    createdUserIds.push(user.id);

    return request(server).post('/auth/login').send({ email, password }).expect(HttpStatus.OK);
  }

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    configureTestApp(app, moduleRef);
    await app.init();
    server = app.getHttpServer() as Server;
    prisma = moduleRef.get(PrismaService);
  });

  afterAll(async () => {
    // RefreshToken rows cascade with their User, so this is the only cleanup needed.
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await app.close();
  });

  describe('POST /auth/login', () => {
    it('sets the refresh token in a cookie', async () => {
      const login = await registerAndLogin();

      const cookie = parseRefreshCookie(login);
      expect(cookie).not.toBeNull();
      expect(cookie?.value.length).toBeGreaterThan(0);
    });

    it('marks the cookie HttpOnly, so no script can read it', async () => {
      const cookie = parseRefreshCookie(await registerAndLogin());

      expect(cookie?.attributes).toHaveProperty('httponly');
    });

    it('scopes the cookie with SameSite=Lax', async () => {
      const cookie = parseRefreshCookie(await registerAndLogin());

      expect(cookie?.attributes.samesite?.toLowerCase()).toBe('lax');
    });

    /**
     * Checked against the real auth routes' own URLs, not just the literal
     * the cookie module hardcodes — so a mismatch between the two would show
     * up here even if nobody reads the cookie module's source.
     */
    it('scopes the cookie to a path the auth routes actually live under', async () => {
      const cookie = parseRefreshCookie(await registerAndLogin());
      const path = cookie?.attributes.path;

      expect(path).toBeDefined();
      expect('/auth/refresh'.startsWith(path as string)).toBe(true);
      // And narrow enough to stay off the business routes.
      expect('/materials'.startsWith(path as string)).toBe(false);
    });

    it('gives the cookie the refresh token lifetime', async () => {
      const cookie = parseRefreshCookie(await registerAndLogin());
      const maxAge = Number(cookie?.attributes['max-age']);

      expect(maxAge).toBeGreaterThan(0);
      // Default REFRESH_TOKEN_EXPIRES_IN_SECONDS is 30 days.
      expect(maxAge).toBe(2_592_000);
    });

    it('returns the access token, its lifetime and the user in the body', async () => {
      const login = await registerAndLogin();
      const body = login.body as SessionResponse;

      expect(typeof body.accessToken).toBe('string');
      expect(body.tokenType).toBe('Bearer');
      expect(body.expiresInSeconds).toBeGreaterThan(0);
      expect(body.user).toMatchObject({ name: 'Heric' });
      expect(body.user).not.toHaveProperty('passwordHash');
    });
  });

  describe('POST /auth/refresh', () => {
    it('reads the cookie, rotates, and writes the new one', async () => {
      const login = await registerAndLogin();
      const first = requireRefreshToken(login);

      const refreshed = await request(server)
        .post('/auth/refresh')
        .set('Cookie', refreshCookieHeader(first))
        .expect(HttpStatus.OK);

      const second = requireRefreshToken(refreshed);
      expect(second).not.toBe(first);
      expect((refreshed.body as SessionResponse).accessToken).toEqual(expect.any(String));
    });

    it('re-arms the cookie attributes on the rotated value', async () => {
      const login = await registerAndLogin();

      const refreshed = await request(server)
        .post('/auth/refresh')
        .set('Cookie', refreshCookieHeader(requireRefreshToken(login)))
        .expect(HttpStatus.OK);

      const cookie = parseRefreshCookie(refreshed);
      expect(cookie?.attributes).toHaveProperty('httponly');
      expect(cookie?.attributes.samesite?.toLowerCase()).toBe('lax');
      expect(cookie?.attributes.path).toBe(parseRefreshCookie(login)?.attributes.path);
    });

    it('leaves the rotated-away token unusable', async () => {
      const login = await registerAndLogin();
      const first = requireRefreshToken(login);

      await request(server)
        .post('/auth/refresh')
        .set('Cookie', refreshCookieHeader(first))
        .expect(HttpStatus.OK);

      await request(server)
        .post('/auth/refresh')
        .set('Cookie', refreshCookieHeader(first))
        .expect(HttpStatus.UNAUTHORIZED);
    });

    it('answers 401 with INVALID_REFRESH_TOKEN when no cookie was sent', async () => {
      const response = await request(server).post('/auth/refresh').expect(HttpStatus.UNAUTHORIZED);

      expect((response.body as ErrorResponseBody).code).toBe('INVALID_REFRESH_TOKEN');
    });

    /** A cleared cookie must not reach the lookup as if it were a token. */
    it('answers 401 for an empty cookie value', async () => {
      await request(server)
        .post('/auth/refresh')
        .set('Cookie', `${REFRESH_TOKEN_COOKIE}=`)
        .expect(HttpStatus.UNAUTHORIZED);
    });

    /**
     * The token in the body is gone, not merely unused: a request that still
     * sends it the old way must fail, or a stale client would appear to keep
     * working while the cookie did nothing.
     */
    it('ignores a refresh token offered in the request body', async () => {
      const login = await registerAndLogin();

      await request(server)
        .post('/auth/refresh')
        .send({ refreshToken: requireRefreshToken(login) })
        .expect(HttpStatus.UNAUTHORIZED);
    });
  });

  describe('POST /auth/logout', () => {
    it('clears the cookie', async () => {
      const login = await registerAndLogin();

      const logout = await request(server)
        .post('/auth/logout')
        .set('Cookie', refreshCookieHeader(requireRefreshToken(login)))
        .expect(HttpStatus.NO_CONTENT);

      const cleared = parseRefreshCookie(logout);
      expect(cleared).not.toBeNull();
      expect(cleared?.value).toBe('');
    });

    /**
     * A browser matches a removal by name and path. Clearing with a
     * different path leaves the original cookie in place, and the user walks
     * away still holding a revoked token that looks like a session.
     */
    it('clears it on the same path it was written with', async () => {
      const login = await registerAndLogin();

      const logout = await request(server)
        .post('/auth/logout')
        .set('Cookie', refreshCookieHeader(requireRefreshToken(login)))
        .expect(HttpStatus.NO_CONTENT);

      expect(parseRefreshCookie(logout)?.attributes.path).toBe(
        parseRefreshCookie(login)?.attributes.path,
      );
    });

    it('revokes the token, so the cookie is useless even if the client kept it', async () => {
      const login = await registerAndLogin();
      const token = requireRefreshToken(login);

      await request(server)
        .post('/auth/logout')
        .set('Cookie', refreshCookieHeader(token))
        .expect(HttpStatus.NO_CONTENT);

      await request(server)
        .post('/auth/refresh')
        .set('Cookie', refreshCookieHeader(token))
        .expect(HttpStatus.UNAUTHORIZED);
    });

    it('clears the cookie and answers 204 even with no cookie at all', async () => {
      const logout = await request(server).post('/auth/logout').expect(HttpStatus.NO_CONTENT);

      expect(parseRefreshCookie(logout)?.value).toBe('');
    });
  });

  /**
   * The acceptance criterion, as a test: the refresh token appears in no
   * response body anywhere. Asserted over the raw text, not the parsed
   * object, so a nested or renamed field cannot slip past.
   */
  describe('the refresh token never appears in a response body', () => {
    it('not on login, refresh or logout', async () => {
      const login = await registerAndLogin();
      const token = requireRefreshToken(login);

      const refreshed = await request(server)
        .post('/auth/refresh')
        .set('Cookie', refreshCookieHeader(token))
        .expect(HttpStatus.OK);

      const logout = await request(server)
        .post('/auth/logout')
        .set('Cookie', refreshCookieHeader(requireRefreshToken(refreshed)))
        .expect(HttpStatus.NO_CONTENT);

      for (const response of [login, refreshed, logout]) {
        expect(response.body).not.toHaveProperty('refreshToken');
        expect(response.text ?? '').not.toContain('refreshToken');
      }

      // And the raw values themselves are nowhere in the payloads.
      expect(login.text ?? '').not.toContain(token);
      expect(refreshed.text ?? '').not.toContain(requireRefreshToken(refreshed));
    });
  });

  /**
   * The scope of the change: business routes were not touched. A route that
   * started accepting the cookie would also be a route a forged cross-site
   * request could reach, which is the premise the CSRF decision rests on
   * (docs/auth-contract.md §5).
   */
  describe('business routes do not depend on the cookie', () => {
    it('refuses a business route that presents only the session cookie', async () => {
      const login = await registerAndLogin();

      await request(server)
        .get('/materials')
        .set('Cookie', refreshCookieHeader(requireRefreshToken(login)))
        .expect(HttpStatus.UNAUTHORIZED);
    });

    it('allows the same route with the bearer token and no cookie', async () => {
      const login = await registerAndLogin();
      const { accessToken } = login.body as SessionResponse;

      await request(server)
        .get('/materials')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(HttpStatus.OK);
    });
  });
});
