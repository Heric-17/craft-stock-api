import { Module } from '@nestjs/common';

import { PrismaModule } from '../../shared/infrastructure/prisma/prisma.module';
import { AuditRetentionService } from './application/services/audit-retention.service';
import { AuditLogService } from './application/services/audit-log.service';
import { AUDIT_RETENTION_PRUNER } from './domain/audit-retention-pruner';
import { AUDIT_TRAIL_READER } from './domain/audit-trail-reader';
import { PrismaAuditRetentionPruner } from './infrastructure/persistence/prisma-audit-retention-pruner';
import { PrismaAuditTrailReader } from './infrastructure/persistence/prisma-audit-trail-reader';
import { AuditLogController } from './presentation/audit-log.controller';

@Module({
  imports: [PrismaModule],
  controllers: [AuditLogController],
  providers: [
    { provide: AUDIT_TRAIL_READER, useClass: PrismaAuditTrailReader },
    { provide: AUDIT_RETENTION_PRUNER, useClass: PrismaAuditRetentionPruner },
    AuditLogService,
    AuditRetentionService,
  ],
})
export class AuditLogModule {}
