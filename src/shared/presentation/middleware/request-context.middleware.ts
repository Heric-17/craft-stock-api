import { randomUUID } from 'node:crypto';

import { Inject, Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

import {
  REQUEST_LOG_WRITER,
  type RequestLogWriter,
} from '../../domain/observability/request-log-writer.port';
import { RequestContextService } from '../../infrastructure/logging/request-context.service';
import { StructuredLogger } from '../../infrastructure/logging/structured-logger.service';

export const CORRELATION_ID_HEADER = 'x-correlation-id';

/** Mirrors `AllExceptionsFilter`'s own threshold (§15.1): errorId = correlationId at and above this. */
const SERVER_ERROR_FLOOR = 500;

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Opens the per-request context (correlation id, transaction id) and, for
 * mutating requests, writes the `RequestLog` row once the response finishes
 * — §15.2: a route that touched nothing is itself an investigation fact, and
 * a request that fails mid-transaction still needs a record that it
 * happened, so this write is outside any business transaction (same
 * reasoning as `ErrorLog`, §15.1).
 *
 * Route/method/userId for the `RequestLog` row are read directly off `req`/
 * `res` rather than back out of `RequestContextService` — plain closures,
 * unaffected by whether `AsyncLocalStorage` context still resolves by the
 * time the `finish` event fires.
 */
@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  constructor(
    private readonly requestContext: RequestContextService,
    private readonly logger: StructuredLogger,
    @Inject(REQUEST_LOG_WRITER) private readonly requestLogWriter: RequestLogWriter,
  ) {}

  use(req: Request, res: Response, next: NextFunction): void {
    const inbound = req.headers[CORRELATION_ID_HEADER];
    const correlationId =
      typeof inbound === 'string' && inbound.trim().length > 0 ? inbound.trim() : randomUUID();
    const transactionId = randomUUID();

    res.setHeader(CORRELATION_ID_HEADER, correlationId);

    if (MUTATING_METHODS.has(req.method)) {
      const startedAt = Date.now();

      res.on('finish', () => {
        void this.writeRequestLog(req, res, { transactionId, correlationId, startedAt });
      });
    }

    this.requestContext.run({ correlationId, transactionId }, () => {
      next();
    });
  }

  private async writeRequestLog(
    req: Request,
    res: Response,
    meta: { transactionId: string; correlationId: string; startedAt: number },
  ): Promise<void> {
    const statusCode = res.statusCode;
    const errorId = statusCode >= SERVER_ERROR_FLOOR ? meta.correlationId : null;

    try {
      await this.requestLogWriter.write({
        transactionId: meta.transactionId,
        route: routePath(req),
        httpMethod: req.method,
        userId: req.user?.id ?? null,
        correlationId: meta.correlationId,
        statusCode,
        durationMs: Date.now() - meta.startedAt,
        errorId,
      });
    } catch (error) {
      // The response has already been sent — there is nothing left to fail.
      // Visibility only, same as an ErrorLog write failure would get.
      this.logger.error(
        `Failed to write RequestLog for transaction ${meta.transactionId}`,
        error instanceof Error ? error.stack : undefined,
        RequestContextMiddleware.name,
      );
    }
  }
}

/**
 * `Request.route` is typed loosely enough by `@types/express` that reading
 * `.path` off it directly resolves to `any`. Narrowed by hand here so this
 * stays a real type, not a silenced lint rule.
 */
function routePath(req: Request): string {
  const route = req.route as { path?: string } | undefined;
  return route?.path ?? req.originalUrl;
}
