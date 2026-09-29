import { Inject, Injectable } from '@nestjs/common';

import type {
  RequestLogEntry,
  RequestLogWriter,
} from '../../domain/observability/request-log-writer.port';
import type { Prisma } from './generated/client';
import { PRISMA_CLIENT } from './prisma-client.token';

@Injectable()
export class PrismaRequestLogWriter implements RequestLogWriter {
  constructor(@Inject(PRISMA_CLIENT) private readonly prisma: Prisma.TransactionClient) {}

  async write(entry: RequestLogEntry): Promise<void> {
    const { error, ...request } = entry;

    // Written through the base client, never a transaction one: this row has
    // to survive the rollback of the very request it describes (§15.1).
    // The failure details flatten into columns here — the four of them are
    // one concept to the domain and four nullable columns to the database.
    await this.prisma.requestLog.create({
      data: {
        ...request,
        errorType: error?.errorType ?? null,
        errorMessage: error?.errorMessage ?? null,
        stackTrace: error?.stackTrace ?? null,
        errorContext: error?.errorContext ?? null,
      },
    });
  }
}
