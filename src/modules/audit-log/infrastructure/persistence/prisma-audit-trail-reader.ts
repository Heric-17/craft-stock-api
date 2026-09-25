import { Inject, Injectable } from '@nestjs/common';

import type { Prisma } from '../../../../shared/infrastructure/prisma/generated/client';
import { PRISMA_CLIENT } from '../../../../shared/infrastructure/prisma/prisma-client.token';
import type {
  AuditTrailFilter,
  AuditTrailReader,
  Investigation,
  InvestigationKey,
  Page,
  UserActivityFilter,
} from '../../domain/audit-trail-reader';
import { USER_RELEVANT_ENTITY_TYPES } from '../../domain/relevant-entities';
import { AuditLogMapper } from './mappers/audit-log.mapper';

@Injectable()
export class PrismaAuditTrailReader implements AuditTrailReader {
  constructor(@Inject(PRISMA_CLIENT) private readonly prisma: Prisma.TransactionClient) {}

  async search(
    filter: AuditTrailFilter,
  ): Promise<Page<ReturnType<typeof AuditLogMapper.toDomain>>> {
    const where: Prisma.AuditLogWhereInput = {
      ...(filter.entityType ? { entityType: filter.entityType } : {}),
      ...(filter.entityId ? { entityId: filter.entityId } : {}),
      ...(filter.transactionId ? { transactionId: filter.transactionId } : {}),
      ...(filter.operation ? { operation: filter.operation } : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { occurredAt: 'desc' },
        take: filter.limit,
        skip: filter.offset,
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return {
      items: rows.map((row) => AuditLogMapper.toDomain(row)),
      total,
      limit: filter.limit,
      offset: filter.offset,
    };
  }

  async findUserActivity(
    filter: UserActivityFilter,
  ): Promise<Page<ReturnType<typeof AuditLogMapper.toDomain>>> {
    const where: Prisma.AuditLogWhereInput = {
      entityType: { in: [...USER_RELEVANT_ENTITY_TYPES] },
    };

    const [rows, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { occurredAt: 'desc' },
        take: filter.limit,
        skip: filter.offset,
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return {
      items: rows.map((row) => AuditLogMapper.toDomain(row)),
      total,
      limit: filter.limit,
      offset: filter.offset,
    };
  }

  async investigate(key: InvestigationKey): Promise<Investigation> {
    const requestRow = await this.findRequestLog(key);

    if (!requestRow) {
      return { request: null, writes: [] };
    }

    const writes = await this.prisma.auditLog.findMany({
      where: { transactionId: requestRow.transactionId },
      orderBy: { occurredAt: 'asc' },
    });

    return {
      request: AuditLogMapper.requestLogToDomain(requestRow),
      writes: writes.map((row) => AuditLogMapper.toDomain(row)),
    };
  }

  private findRequestLog(key: InvestigationKey) {
    if (key.transactionId) {
      return this.prisma.requestLog.findUnique({ where: { transactionId: key.transactionId } });
    }

    const value = key.correlationId ?? key.errorId;

    if (!value) {
      return Promise.resolve(null);
    }

    // errorId is always equal to correlationId (§15.1) when set, so either
    // name resolves the same row — a user searching by the errorId their
    // error toast showed them shouldn't need to know that.
    return this.prisma.requestLog.findFirst({
      where: { OR: [{ correlationId: value }, { errorId: value }] },
    });
  }
}
