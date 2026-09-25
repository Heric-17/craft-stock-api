import { Inject, Injectable } from '@nestjs/common';

import type { Prisma } from '../../../../shared/infrastructure/prisma/generated/client';
import { PRISMA_CLIENT } from '../../../../shared/infrastructure/prisma/prisma-client.token';
import type { AuditRetentionPruner } from '../../domain/audit-retention-pruner';

@Injectable()
export class PrismaAuditRetentionPruner implements AuditRetentionPruner {
  constructor(@Inject(PRISMA_CLIENT) private readonly prisma: Prisma.TransactionClient) {}

  async pruneAuditLog(olderThan: Date): Promise<number> {
    const { count } = await this.prisma.auditLog.deleteMany({
      where: { occurredAt: { lt: olderThan } },
    });

    return count;
  }

  async pruneRequestLog(olderThan: Date): Promise<number> {
    const { count } = await this.prisma.requestLog.deleteMany({
      where: { occurredAt: { lt: olderThan } },
    });

    return count;
  }
}
