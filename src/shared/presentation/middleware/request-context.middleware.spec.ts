import type { NextFunction, Request, Response } from 'express';

import { RequestContextService } from '../../infrastructure/logging/request-context.service';
import { CORRELATION_ID_HEADER, RequestContextMiddleware } from './request-context.middleware';

const UUID_PATTERN = /^[0-9a-f-]{36}$/;

interface Harness {
  requestContext: RequestContextService;
  headers: Record<string, string>;
  requestLogWrite: jest.Mock;
  loggerError: jest.Mock;
  statusCode: number;
  triggerFinish: () => void;
  run: (options?: { method?: string; inboundCorrelationId?: string; user?: { id: string } }) => {
    seenCorrelationId: string | undefined;
    seenTransactionId: string | undefined;
  };
}

function harness(): Harness {
  const requestContext = new RequestContextService();
  const headers: Record<string, string> = {};
  const requestLogWrite = jest.fn().mockResolvedValue(undefined);
  const loggerError = jest.fn();
  const finishHandlers: Array<() => void> = [];
  let statusCode = 200;

  const requestLogWriter = { write: requestLogWrite } as never;
  const logger = { error: loggerError } as never;

  const middleware = new RequestContextMiddleware(requestContext, logger, requestLogWriter);

  const run: Harness['run'] = (options = {}) => {
    let seenCorrelationId: string | undefined;
    let seenTransactionId: string | undefined;

    const req = {
      method: options.method ?? 'POST',
      headers:
        options.inboundCorrelationId === undefined
          ? {}
          : { [CORRELATION_ID_HEADER]: options.inboundCorrelationId },
      originalUrl: '/materials/123',
      route: { path: '/materials/:id' },
      user: options.user,
    } as unknown as Request;

    const res = {
      setHeader: (name: string, value: string): void => {
        headers[name] = value;
      },
      on: (event: string, handler: () => void): void => {
        if (event === 'finish') {
          finishHandlers.push(handler);
        }
      },
      get statusCode() {
        return statusCode;
      },
    } as unknown as Response;

    const next: NextFunction = () => {
      seenCorrelationId = requestContext.correlationId;
      seenTransactionId = requestContext.transactionId;
    };

    middleware.use(req, res, next);

    return { seenCorrelationId, seenTransactionId };
  };

  return {
    requestContext,
    headers,
    requestLogWrite,
    loggerError,
    get statusCode() {
      return statusCode;
    },
    set statusCode(value: number) {
      statusCode = value;
    },
    triggerFinish: () => finishHandlers.forEach((handler) => handler()),
    run,
  };
}

describe('RequestContextMiddleware', () => {
  it('generates a correlation id when the caller sends none', () => {
    const h = harness();

    const { seenCorrelationId } = h.run();

    expect(seenCorrelationId).toMatch(UUID_PATTERN);
    expect(h.headers[CORRELATION_ID_HEADER]).toBe(seenCorrelationId);
  });

  it('reuses the inbound correlation id', () => {
    const h = harness();

    const { seenCorrelationId } = h.run({ inboundCorrelationId: 'from-the-gateway' });

    expect(seenCorrelationId).toBe('from-the-gateway');
    expect(h.headers[CORRELATION_ID_HEADER]).toBe('from-the-gateway');
  });

  it('ignores a blank inbound correlation id', () => {
    const h = harness();

    expect(h.run({ inboundCorrelationId: '   ' }).seenCorrelationId).toMatch(UUID_PATTERN);
  });

  it('generates a fresh transactionId distinct from the correlation id', () => {
    const h = harness();

    const { seenCorrelationId, seenTransactionId } = h.run();

    expect(seenTransactionId).toMatch(UUID_PATTERN);
    expect(seenTransactionId).not.toBe(seenCorrelationId);
  });

  it('closes the context once the request is done', () => {
    const h = harness();

    h.run();

    expect(h.requestContext.correlationId).toBeUndefined();
    expect(h.requestContext.transactionId).toBeUndefined();
  });

  it('writes a RequestLog row when a mutating request finishes', async () => {
    const h = harness();
    h.statusCode = 201;

    const { seenCorrelationId, seenTransactionId } = h.run({ method: 'POST', user: { id: 'u1' } });
    h.triggerFinish();
    await flushMicrotasks();

    expect(h.requestLogWrite).toHaveBeenCalledTimes(1);
    expect(h.requestLogWrite).toHaveBeenCalledWith(
      expect.objectContaining({
        transactionId: seenTransactionId,
        correlationId: seenCorrelationId,
        route: '/materials/:id',
        httpMethod: 'POST',
        userId: 'u1',
        statusCode: 201,
        errorId: null,
      }),
    );
  });

  it('does not write a RequestLog row for a GET request', async () => {
    const h = harness();

    h.run({ method: 'GET' });
    h.triggerFinish();
    await flushMicrotasks();

    expect(h.requestLogWrite).not.toHaveBeenCalled();
  });

  it('sets errorId to the correlationId only at or above 500', async () => {
    const h = harness();
    h.statusCode = 422;

    h.run({ method: 'PATCH' });
    h.triggerFinish();
    await flushMicrotasks();

    expect(h.requestLogWrite).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 422, errorId: null }),
    );
  });

  it('sets errorId equal to correlationId for a 500', async () => {
    const h = harness();
    h.statusCode = 500;

    const { seenCorrelationId } = h.run({ method: 'DELETE' });
    h.triggerFinish();
    await flushMicrotasks();

    expect(h.requestLogWrite).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 500, errorId: seenCorrelationId }),
    );
  });

  it('records userId as null when no user is attached to the request', async () => {
    const h = harness();

    h.run({ method: 'POST' });
    h.triggerFinish();
    await flushMicrotasks();

    expect(h.requestLogWrite).toHaveBeenCalledWith(expect.objectContaining({ userId: null }));
  });

  it('logs, but does not throw, when writing the RequestLog fails', async () => {
    const h = harness();
    h.requestLogWrite.mockRejectedValueOnce(new Error('db down'));

    h.run({ method: 'POST' });
    h.triggerFinish();
    await flushMicrotasks();

    expect(h.loggerError).toHaveBeenCalledTimes(1);
  });
});

function flushMicrotasks(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}
