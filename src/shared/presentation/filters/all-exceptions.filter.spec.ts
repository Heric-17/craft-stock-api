import { BadRequestException, HttpStatus, NotFoundException } from '@nestjs/common';
import type { ArgumentsHost } from '@nestjs/common';
import type { Request, Response } from 'express';

import {
  DuplicateInvoiceError,
  InvoiceSourceUnavailableError,
  InvoiceStructureChangedError,
} from '../../../modules/invoices/domain/invoice.error';
import type { ErrorAlertService } from '../../application/observability/error-alert.service';
import { DomainError } from '../../domain/errors/domain.error';
import { RequestContextService } from '../../infrastructure/logging/request-context.service';
import type { StructuredLogger } from '../../infrastructure/logging/structured-logger.service';
import { AllExceptionsFilter, type ErrorResponseBody } from './all-exceptions.filter';

class InsufficientStockError extends DomainError {
  constructor() {
    super('Not enough stock to produce the requested quantity');
  }
}

interface Captured {
  status: number;
  body: ErrorResponseBody;
}

describe('AllExceptionsFilter', () => {
  let requestContext: RequestContextService;
  let logger: { error: jest.Mock; warn: jest.Mock };
  let notifyServerError: jest.Mock;
  let filter: AllExceptionsFilter;
  let captured: Captured;
  let host: ArgumentsHost;

  beforeEach(() => {
    requestContext = new RequestContextService();
    logger = { error: jest.fn(), warn: jest.fn() };
    notifyServerError = jest.fn().mockResolvedValue(undefined);
    filter = new AllExceptionsFilter(logger as unknown as StructuredLogger, requestContext, {
      notifyServerError,
    } as unknown as ErrorAlertService);
    captured = { status: 0, body: {} as ErrorResponseBody };

    const response = {
      status: (status: number) => {
        captured.status = status;

        return {
          json: (body: ErrorResponseBody) => {
            captured.body = body;
          },
        };
      },
    } as unknown as Response;

    const request = { url: '/materials/42', method: 'GET' } as Request;

    host = {
      switchToHttp: () => ({
        getResponse: () => response,
        getRequest: () => request,
      }),
    } as unknown as ArgumentsHost;
  });

  it('keeps the status and message of an HttpException', () => {
    filter.catch(new NotFoundException('Material not found'), host);

    expect(captured.status).toBe(HttpStatus.NOT_FOUND);
    expect(captured.body).toMatchObject({
      statusCode: HttpStatus.NOT_FOUND,
      message: 'Material not found',
      path: '/materials/42',
    });
    expect(logger.warn).toHaveBeenCalled();
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('collects validation violations under details', () => {
    filter.catch(new BadRequestException(['name should not be empty']), host);

    expect(captured.status).toBe(HttpStatus.BAD_REQUEST);
    expect(captured.body.message).toBe('Validation failed');
    expect(captured.body.details).toEqual(['name should not be empty']);
  });

  it('renders a domain error as 422', () => {
    filter.catch(new InsufficientStockError(), host);

    expect(captured.status).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
    expect(captured.body).toMatchObject({
      error: 'InsufficientStockError',
      message: 'Not enough stock to produce the requested quantity',
    });
  });

  it('hides the detail of an unexpected failure and logs it as an error', () => {
    filter.catch(new Error('connect ECONNREFUSED 127.0.0.1:5432'), host);

    expect(captured.status).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(captured.body.message).toBe('Internal server error');
    expect(JSON.stringify(captured.body)).not.toContain('ECONNREFUSED');
    expect(logger.error).toHaveBeenCalled();
  });

  it('includes the correlation id of the current request', () => {
    requestContext.run({ correlationId: 'filter-id', transactionId: 'filter-txn' }, () => {
      filter.catch(new NotFoundException(), host);
    });

    expect(captured.body.correlationId).toBe('filter-id');
  });

  it('omits errorId below the server-error floor', () => {
    requestContext.run({ correlationId: 'filter-id', transactionId: 'filter-txn' }, () => {
      filter.catch(new NotFoundException(), host);
    });

    expect(captured.body.errorId).toBeUndefined();
  });

  it('sets errorId equal to the correlation id at and above 500', () => {
    requestContext.run({ correlationId: 'filter-id', transactionId: 'filter-txn' }, () => {
      filter.catch(new Error('boom'), host);
    });

    expect(captured.status).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(captured.body.errorId).toBe('filter-id');
  });

  /**
   * Three import failures that mean something more specific over the wire
   * than "understood and refused". The status is decided here rather than on
   * the error class, which carries no HTTP knowledge of its own.
   */
  describe('the named NFC-e import failures', () => {
    it('reports an already-imported note as 409, naming the existing purchase', () => {
      filter.catch(new DuplicateInvoiceError('4'.repeat(44), 'purchase-1'), host);

      expect(captured.status).toBe(HttpStatus.CONFLICT);
      expect(captured.body.message).toContain('purchase-1');
      expect(captured.body.error).toBe('DuplicateInvoiceError');
    });

    it('reports an unreachable portal as 503', () => {
      filter.catch(new InvoiceSourceUnavailableError('The portal did not answer.', 3), host);

      expect(captured.status).toBe(HttpStatus.SERVICE_UNAVAILABLE);
      expect(captured.body.error).toBe('InvoiceSourceUnavailableError');
    });

    it('reports a page that is not a note as 502', () => {
      filter.catch(new InvoiceStructureChangedError('Markers absent.'), host);

      expect(captured.status).toBe(HttpStatus.BAD_GATEWAY);
      expect(captured.body.error).toBe('InvoiceStructureChangedError');
    });

    /**
     * The alarm for the scraping having broken. A warning buried among
     * ordinary refusals would not be seen, and every import from that source
     * is failing until someone looks.
     */
    it('logs a structural break at error severity, not as a warning', () => {
      filter.catch(new InvoiceStructureChangedError('Markers absent.'), host);

      expect(logger.error).toHaveBeenCalled();
      expect(logger.warn).not.toHaveBeenCalled();
      const calls = logger.error.mock.calls as unknown[][];
      expect(String(calls[0][0])).toContain('structurally broken');
    });

    /**
     * Also an error, by the ordinary 5xx rule — but without the structural
     * break's prefix, so the two are distinguishable in the log. One says the
     * portal is down; the other says our scraper is.
     */
    it('logs an unavailable portal without the structural-break wording', () => {
      filter.catch(new InvoiceSourceUnavailableError('down', 3), host);

      expect(logger.error).toHaveBeenCalled();
      const calls = logger.error.mock.calls as unknown[][];
      expect(String(calls[0][0])).not.toContain('structurally broken');
    });

    it('still defaults an unmapped domain error to 422', () => {
      filter.catch(new InsufficientStockError(), host);

      expect(captured.status).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
    });
  });

  /**
   * The filter is the only place that sees every failure, so it is where the
   * cause is recorded for the request row the middleware writes afterwards.
   */
  describe('recording the cause on the request context', () => {
    it('records type, message and stack of an unexpected failure', () => {
      requestContext.run({ correlationId: 'c1', transactionId: 't1' }, () => {
        filter.catch(new Error('connect ECONNREFUSED 127.0.0.1:5432'), host);

        expect(requestContext.error).toMatchObject({
          errorType: 'Error',
          errorMessage: 'connect ECONNREFUSED 127.0.0.1:5432',
        });
        expect(requestContext.error?.stackTrace).toContain('Error');
      });
    });

    it('records the domain error class, not a generic one', () => {
      requestContext.run({ correlationId: 'c1', transactionId: 't1' }, () => {
        filter.catch(new InsufficientStockError(), host);

        expect(requestContext.error?.errorType).toBe('InsufficientStockError');
      });
    });

    it('keeps the violations of a validation failure as context', () => {
      requestContext.run({ correlationId: 'c1', transactionId: 't1' }, () => {
        filter.catch(new BadRequestException(['name should not be empty']), host);

        expect(requestContext.error?.errorContext).toContain('name should not be empty');
      });
    });

    it('redacts a credential that reached the message', () => {
      requestContext.run({ correlationId: 'c1', transactionId: 't1' }, () => {
        filter.catch(new Error('login failed for password=hunter2'), host);

        const recorded = JSON.stringify(requestContext.error);
        expect(recorded).not.toContain('hunter2');
        expect(recorded).toContain('[REDACTED]');
      });
    });

    it('records nothing when there is no open request context', () => {
      expect(() => filter.catch(new Error('boom'), host)).not.toThrow();
    });
  });

  describe('alerting', () => {
    it('raises an alert for a server error, carrying the errorId', () => {
      requestContext.run({ correlationId: 'alert-id', transactionId: 't1' }, () => {
        filter.catch(new Error('boom'), host);
      });

      expect(notifyServerError).toHaveBeenCalledWith(
        expect.objectContaining({
          errorType: 'Error',
          message: 'boom',
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          httpMethod: 'GET',
          correlationId: 'alert-id',
        }),
      );
    });

    it('does not alert on a client error', () => {
      filter.catch(new NotFoundException('Material not found'), host);

      expect(notifyServerError).not.toHaveBeenCalled();
    });

    it('alerts with the redacted message, never the raw one', () => {
      filter.catch(new Error('token=abc123 rejected'), host);

      const [alert] = notifyServerError.mock.calls[0] as [{ message: string }];
      expect(alert.message).not.toContain('abc123');
    });

    /** An alert is a side effect. A broken alert channel must not change the response. */
    it('still answers the request when raising the alert fails', async () => {
      notifyServerError.mockRejectedValueOnce(new Error('smtp down'));

      filter.catch(new Error('boom'), host);
      await new Promise((resolve) => setImmediate(resolve));

      expect(captured.status).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(captured.body.message).toBe('Internal server error');
      expect(logger.error).toHaveBeenCalled();
    });
  });
});
