import type { Server } from 'node:http';

import { HttpStatus, type INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { CORRELATION_ID_HEADER } from '../src/shared/presentation/middleware/request-context.middleware';

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
    const response = await request(server).get('/does-not-exist').expect(HttpStatus.NOT_FOUND);
    const body = response.body as ErrorBody;

    expect(body.statusCode).toBe(HttpStatus.NOT_FOUND);
    expect(body.path).toBe('/does-not-exist');
    expect(body.correlationId).toEqual(expect.any(String));
  });
});
