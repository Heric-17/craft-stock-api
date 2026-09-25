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
    await this.prisma.requestLog.create({ data: entry });
  }
}
