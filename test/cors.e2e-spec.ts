import type { Server } from 'node:http';

import { HttpStatus, type INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { DEVELOPMENT_CORS_ORIGINS } from '../src/shared/presentation/http/cors-origins';
import { CORRELATION_ID_HEADER } from '../src/shared/presentation/middleware/request-context.middleware';
import { configureTestApp } from './support/configure-test-app';

/**
 * Before this, nothing in the application called `enableCors`, so no browser
 * request completed at all — not even against localhost. These tests exist to
 * keep that from coming back silently: a regression here looks, from the
 * client side, like an API that is simply unreachable, with nothing in the
 * server log to say why.
 *
 * The suite runs with `CORS_ORIGINS` unset, so the allow-list is the
 * development fallback — Vite's dev server.
 */
describe('CORS (e2e)', () => {
  let app: INestApplication;
  let server: Server;

  const allowedOrigin = DEVELOPMENT_CORS_ORIGINS[0];
  const unknownOrigin = 'https://attacker.example';

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    configureTestApp(app, moduleRef);
    await app.init();
    server = app.getHttpServer() as Server;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('preflight from a configured origin', () => {
    // Deliberately not `async`: hands back the supertest chain so each test
    // can append its own expectations.
    function preflight(origin: string, method = 'POST'): request.Test {
      return request(server)
        .options('/auth/login')
        .set('Origin', origin)
        .set('Access-Control-Request-Method', method);
    }

    it('answers the preflight and echoes the origin back', async () => {
      const response = await preflight(allowedOrigin);

      expect(response.status).toBeLessThan(HttpStatus.BAD_REQUEST);
      expect(response.headers['access-control-allow-origin']).toBe(allowedOrigin);
    });

    /**
     * Without this the browser discards the response of every credentialed
     * request, which is every request that carries the session cookie.
     */
    it('allows credentials, which the session cookie depends on', async () => {
      const response = await preflight(allowedOrigin);

      expect(response.headers['access-control-allow-credentials']).toBe('true');
    });

    it('never answers with a wildcard, which no browser accepts with credentials', async () => {
      const response = await preflight(allowedOrigin);

      expect(response.headers['access-control-allow-origin']).not.toBe('*');
    });

    it('permits the methods the API answers to, and the headers it reads', async () => {
      const response = await preflight(allowedOrigin);

      const methods = (response.headers['access-control-allow-methods'] ?? '').split(/,\s*/);
      expect(methods).toEqual(expect.arrayContaining(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']));

      const headers = (response.headers['access-control-allow-headers'] ?? '').toLowerCase();
      expect(headers).toContain('authorization');
      expect(headers).toContain('content-type');
    });

    /**
     * The correlation id is what a user quotes to have a failure
     * investigated (§15.1). Unexposed, the SPA cannot read it off the
     * response and it never reaches the screen.
     */
    it('exposes the correlation id so the client can read it back', async () => {
      const response = await preflight(allowedOrigin);

      expect((response.headers['access-control-expose-headers'] ?? '').toLowerCase()).toContain(
        CORRELATION_ID_HEADER,
      );
    });

    it('accepts every method the SPA uses on business routes', async () => {
      for (const method of ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']) {
        const response = await request(server)
          .options('/materials')
          .set('Origin', allowedOrigin)
          .set('Access-Control-Request-Method', method);

        expect(response.headers['access-control-allow-origin']).toBe(allowedOrigin);
      }
    });
  });

  describe('preflight from an unknown origin', () => {
    it('does not grant the origin', async () => {
      const response = await request(server)
        .options('/auth/login')
        .set('Origin', unknownOrigin)
        .set('Access-Control-Request-Method', 'POST');

      // No `Access-Control-Allow-Origin` at all is what makes the browser
      // refuse the call. The server may still answer 204 to the OPTIONS
      // itself; it is the missing header that does the work.
      expect(response.headers['access-control-allow-origin']).toBeUndefined();
    });

    /**
     * `Access-Control-Allow-Credentials` IS still sent here, because the
     * middleware emits it whenever `credentials: true` is configured, for
     * any origin. That is not a leak: a browser only sends credentials when
     * the response also grants the requesting origin, and it does not. The
     * assertion is written this way on purpose, so nobody later "fixes" the
     * absent-origin test by checking this header instead — it would pass for
     * the wrong reason and then never fail.
     */
    it('grants no origin, which is what makes the credentials header harmless', async () => {
      const response = await request(server)
        .options('/auth/login')
        .set('Origin', unknownOrigin)
        .set('Access-Control-Request-Method', 'POST');

      expect(response.headers['access-control-allow-origin']).toBeUndefined();
      // And in particular never the attacker's own origin.
      expect(response.headers['access-control-allow-origin']).not.toBe(unknownOrigin);
    });

    /**
     * The guard against a half-fix: the real request has to go unendorsed
     * too, not only the preflight.
     */
    it('leaves the actual request unendorsed as well', async () => {
      const response = await request(server)
        .post('/auth/login')
        .set('Origin', unknownOrigin)
        .send({ email: 'nobody@craftstock.dev', password: 'whatever' });

      expect(response.headers['access-control-allow-origin']).toBeUndefined();
    });
  });

  /**
   * CORS is a browser rule, not a firewall: a request with no `Origin` is not
   * a browser and is unaffected. Pinned so nobody mistakes this for access
   * control and removes the real one.
   */
  it('does not interfere with a request that carries no Origin', async () => {
    await request(server).get('/health').expect(HttpStatus.OK);
  });
});
