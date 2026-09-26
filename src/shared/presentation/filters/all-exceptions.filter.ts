import {
  Catch,
  HttpException,
  HttpStatus,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import type { Request, Response } from 'express';

import {
  InvalidCredentialsError,
  InvalidRefreshTokenError,
} from '../../../modules/auth/domain/auth.error';
import {
  DuplicateInvoiceError,
  InvoiceSourceUnavailableError,
  InvoiceStructureChangedError,
} from '../../../modules/invoices/domain/invoice.error';
import { PurchaseNotFoundError } from '../../../modules/purchases/domain/purchase.error';
import {
  EmailAlreadyInUseError,
  UserNotFoundError,
} from '../../../modules/users/domain/user.error';
import { DomainError } from '../../domain/errors/domain.error';
import { ImageUploadFailedError } from '../../domain/errors/image-upload-failed.error';
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
  /**
   * Present only at or above `SERVER_ERROR_FLOOR` and always equal to
   * `correlationId` (§15.1) — this is what a user hands back for someone to
   * search the `RequestLog`/`AuditLog` trail by (§15.2's investigation
   * endpoint accepts it directly).
   */
  errorId?: string;
}

/** Anything at or above this status is a failure of ours, not of the caller. */
const SERVER_ERROR_FLOOR = 500;

/**
 * Domain errors that mean something more specific over the wire than "the
 * request was understood and refused".
 *
 * A domain error carries no HTTP status of its own — deciding that is this
 * layer's job, and putting a status code on a domain class would put HTTP
 * inside the domain. The default for everything not listed here is 422.
 */
const DOMAIN_ERROR_STATUS: readonly {
  error: abstract new (...args: never[]) => DomainError;
  status: number;
}[] = [
  // The note is already recorded. Not a failure: the client is told where the
  // purchase it was about to duplicate already lives.
  { error: DuplicateInvoiceError, status: HttpStatus.CONFLICT },
  // The purchase addressed does not exist. Nothing about the request is
  // wrong beyond the id it names, which is what 404 says.
  { error: PurchaseNotFoundError, status: HttpStatus.NOT_FOUND },
  // The state portal is down. Nothing is wrong with the request, and it is
  // worth making again later — which is what the pending queue is for.
  { error: InvoiceSourceUnavailableError, status: HttpStatus.SERVICE_UNAVAILABLE },
  // The portal answered with something we could not read. A failure of ours,
  // upstream: reported as a bad gateway and logged loudly below.
  { error: InvoiceStructureChangedError, status: HttpStatus.BAD_GATEWAY },
  // Wrong email or wrong password — the request is understood, the caller
  // just is not who they claim to be.
  { error: InvalidCredentialsError, status: HttpStatus.UNAUTHORIZED },
  // The refresh token is unknown, expired, or already spent by rotation.
  { error: InvalidRefreshTokenError, status: HttpStatus.UNAUTHORIZED },
  // Registration named an email that is already taken.
  { error: EmailAlreadyInUseError, status: HttpStatus.CONFLICT },
  // A token pointed at a User id that no longer exists.
  { error: UserNotFoundError, status: HttpStatus.NOT_FOUND },
  // The storage backend (disk or S3) did not complete an upload or a delete.
  // Nothing is wrong with the request; it is worth retrying.
  { error: ImageUploadFailedError, status: HttpStatus.SERVICE_UNAVAILABLE },
];

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
      ...(described.status >= SERVER_ERROR_FLOOR && this.requestContext.correlationId !== undefined
        ? { errorId: this.requestContext.correlationId }
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
      const mapped = DOMAIN_ERROR_STATUS.find(({ error }) => exception instanceof error);

      return {
        status: mapped?.status ?? HttpStatus.UNPROCESSABLE_ENTITY,
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

    // The alarm for the NFC-e scraping having broken. It is logged at error
    // severity whatever its status, because it means the portal changed its
    // markup and every import from that source is failing until someone
    // looks — a warning buried among ordinary refusals would not be seen.
    if (exception instanceof InvoiceStructureChangedError) {
      this.logger.error(
        `${summary} — NFC-e extraction is structurally broken: ${exception.message}`,
        stack,
        AllExceptionsFilter.name,
      );
      return;
    }

    if (described.status >= SERVER_ERROR_FLOOR) {
      this.logger.error(summary, stack, AllExceptionsFilter.name);
      return;
    }

    this.logger.warn(summary, AllExceptionsFilter.name);
  }
}
