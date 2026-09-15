import type { NextFunction, Request, Response } from 'express';

import { RequestContextService } from '../../infrastructure/logging/request-context.service';
import { CORRELATION_ID_HEADER, CorrelationIdMiddleware } from './correlation-id.middleware';

interface Harness {
  middleware: CorrelationIdMiddleware;
  requestContext: RequestContextService;
  headers: Record<string, string>;
  run: (inbound?: string) => string | undefined;
}

function harness(): Harness {
  const requestContext = new RequestContextService();
  const middleware = new CorrelationIdMiddleware(requestContext);
  const headers: Record<string, string> = {};

  const run = (inbound?: string): string | undefined => {
    let seen: string | undefined;

    const req = {
      headers: inbound === undefined ? {} : { [CORRELATION_ID_HEADER]: inbound },
    } as unknown as Request;

    const res = {
      setHeader: (name: string, value: string): void => {
        headers[name] = value;
      },
    } as unknown as Response;

    const next: NextFunction = () => {
      seen = requestContext.correlationId;
    };

    middleware.use(req, res, next);

    return seen;
  };

  return { middleware, requestContext, headers, run };
}

describe('CorrelationIdMiddleware', () => {
  it('generates a correlation id when the caller sends none', () => {
    const { headers, run } = harness();

    const seen = run();

    expect(seen).toMatch(/^[0-9a-f-]{36}$/);
    expect(headers[CORRELATION_ID_HEADER]).toBe(seen);
  });

  it('reuses the inbound correlation id', () => {
    const { headers, run } = harness();

    expect(run('from-the-gateway')).toBe('from-the-gateway');
    expect(headers[CORRELATION_ID_HEADER]).toBe('from-the-gateway');
  });

  it('ignores a blank inbound correlation id', () => {
    const { run } = harness();

    expect(run('   ')).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('closes the context once the request is done', () => {
    const { requestContext, run } = harness();

    run();

    expect(requestContext.correlationId).toBeUndefined();
  });
});
