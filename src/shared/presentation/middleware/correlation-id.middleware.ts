import { randomUUID } from 'node:crypto';

import { Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

import { RequestContextService } from '../../infrastructure/logging/request-context.service';

export const CORRELATION_ID_HEADER = 'x-correlation-id';

/**
 * Opens the request context. Reuses an inbound correlation id when the caller
 * provides one, so a request can be followed across services.
 */
@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
  constructor(private readonly requestContext: RequestContextService) {}

  use(req: Request, res: Response, next: NextFunction): void {
    const inbound = req.headers[CORRELATION_ID_HEADER];
    const correlationId =
      typeof inbound === 'string' && inbound.trim().length > 0 ? inbound.trim() : randomUUID();

    res.setHeader(CORRELATION_ID_HEADER, correlationId);

    this.requestContext.run({ correlationId }, () => {
      next();
    });
  }
}
