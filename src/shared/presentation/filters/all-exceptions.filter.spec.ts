import { BadRequestException, HttpStatus, NotFoundException } from '@nestjs/common';
import type { ArgumentsHost } from '@nestjs/common';
import type { Request, Response } from 'express';

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
  let filter: AllExceptionsFilter;
  let captured: Captured;
  let host: ArgumentsHost;

  beforeEach(() => {
    requestContext = new RequestContextService();
    logger = { error: jest.fn(), warn: jest.fn() };
    filter = new AllExceptionsFilter(logger as unknown as StructuredLogger, requestContext);
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
    requestContext.run({ correlationId: 'filter-id' }, () => {
      filter.catch(new NotFoundException(), host);
    });

    expect(captured.body.correlationId).toBe('filter-id');
  });
});
