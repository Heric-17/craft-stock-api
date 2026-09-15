import {
  Catch,
  HttpException,
  HttpStatus,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import type { Request, Response } from 'express';

import { DomainError } from '../../domain/errors/domain.error';
import { RequestContextService } from '../../infrastructure/logging/request-context.service';
import { StructuredLogger } from '../../infrastructure/logging/structured-logger.service';

export interface ErrorResponseBody {
  statusCode: number;
  error: string;
  message: string;
  details?: unknown;
  path: string;
  timestamp: string;
  correlationId?: string;
}

/** Anything at or above this status is a failure of ours, not of the caller. */
const SERVER_ERROR_FLOOR = 500;

interface DescribedError {
  status: number;
  error: string;
  message: string;
  details?: unknown;
}

/**
 * Single exit point for every failure: one response shape, one place where the
 * error is logged, and no internal detail leaking to the client on a 500.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(
    private readonly logger: StructuredLogger,
    private readonly requestContext: RequestContextService,
  ) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const response = http.getResponse<Response>();
    const request = http.getRequest<Request>();

    const described = this.describe(exception);

    const body: ErrorResponseBody = {
      statusCode: described.status,
      error: described.error,
      message: described.message,
      ...(described.details !== undefined ? { details: described.details } : {}),
      path: request.url,
      timestamp: new Date().toISOString(),
      ...(this.requestContext.correlationId !== undefined
        ? { correlationId: this.requestContext.correlationId }
        : {}),
    };

    this.report(exception, described, request);

    response.status(described.status).json(body);
  }

  private describe(exception: unknown): DescribedError {
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const payload = exception.getResponse();

      if (typeof payload === 'string') {
        return { status, error: exception.name, message: payload };
      }

      const record = payload as Record<string, unknown>;
      const message = record.message;

      // `ValidationPipe` reports every violation as an array of strings.
      if (Array.isArray(message)) {
        return {
          status,
          error: typeof record.error === 'string' ? record.error : exception.name,
          message: 'Validation failed',
          details: message,
        };
      }

      return {
        status,
        error: typeof record.error === 'string' ? record.error : exception.name,
        message: typeof message === 'string' ? message : exception.message,
      };
    }

    if (exception instanceof DomainError) {
      return {
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        error: exception.name,
        message: exception.message,
      };
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      error: 'InternalServerError',
      message: 'Internal server error',
    };
  }

  private report(exception: unknown, described: DescribedError, request: Request): void {
    const summary = `${request.method} ${request.url} -> ${described.status} ${described.error}`;
    const stack = exception instanceof Error ? exception.stack : undefined;

    if (described.status >= SERVER_ERROR_FLOOR) {
      this.logger.error(summary, stack, AllExceptionsFilter.name);
      return;
    }

    this.logger.warn(summary, AllExceptionsFilter.name);
  }
}
