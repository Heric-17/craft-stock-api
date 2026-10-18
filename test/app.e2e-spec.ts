import type { Server } from 'node:http';

import { HttpStatus, type INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { CORRELATION_ID_HEADER } from '../src/shared/presentation/middleware/request-context.middleware';
import { configureTestApp } from './support/configure-test-app';
import { api, apiRoute } from './support/api';

interface HealthBody {
  status: string;
  uptimeSeconds: number;
  timestamp: string;
}

interface ErrorBody {
  statusCode: number;
  error: string;
  message: string;
  path: string;
  correlationId?: string;
}

describe('Application (e2e)', () => {
  let app: INestApplication;
  let server: Server;

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

  it('GET /health returns the liveness payload', async () => {
    const response = await request(server).get('/health').expect(HttpStatus.OK);
    const body = response.body as HealthBody;

    expect(body.status).toBe('ok');
    expect(typeof body.uptimeSeconds).toBe('number');
  });

  it('assigns a correlation id when the caller does not send one', async () => {
    const response = await request(server).get('/health').expect(HttpStatus.OK);

    expect(response.headers[CORRELATION_ID_HEADER]).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('echoes the inbound correlation id', async () => {
    const correlationId = 'e2e-correlation-id';

    const response = await request(server)
      .get('/health')
      .set(CORRELATION_ID_HEADER, correlationId)
      .expect(HttpStatus.OK);

    expect(response.headers[CORRELATION_ID_HEADER]).toBe(correlationId);
  });

  it('renders unknown routes through the global exception filter', async () => {
    const response = await api(server).get('/does-not-exist').expect(HttpStatus.NOT_FOUND);
    const body = response.body as ErrorBody;

    expect(body.statusCode).toBe(HttpStatus.NOT_FOUND);
    expect(body.path).toBe(apiRoute('/does-not-exist'));
    expect(body.correlationId).toEqual(expect.any(String));
  });

  /**
   * The web app reaches the API through a rewrite of `/api/*` on its own host,
   * and the platform's health check calls `/health`. Both sides of that are
   * pinned here: a business route answers only under the prefix, and the probe
   * only outside it.
   */
  describe('route prefix', () => {
    it('serves business routes under the prefix', async () => {
      // 401, not 404: the route exists and the guard is what answered.
      await api(server).get('/materials').expect(HttpStatus.UNAUTHORIZED);
    });

    /**
     * Still a 404 in the usual shape, but without a correlation id: the request
     * context middleware is mounted under the prefix (and on the probe), so a
     * path that is not the API's carries none.
     */
    it('does not serve business routes at the root', async () => {
      await request(server).get('/materials').expect(HttpStatus.NOT_FOUND);
    });

    it('keeps the health check outside the prefix', async () => {
      await api(server).get('/health').expect(HttpStatus.NOT_FOUND);
    });
  });
});
