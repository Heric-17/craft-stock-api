import { Inject, Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

import { EnvService } from '../../../../config/env.service';
import { StructuredLogger } from '../../../../shared/infrastructure/logging/structured-logger.service';
import {
  AUDIT_RETENTION_PRUNER,
  type AuditRetentionPruner,
} from '../../domain/audit-retention-pruner';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface RetentionResult {
  auditLogDeleted: number;
  requestLogDeleted: number;
}

/**
 * §17: in-process scheduling via `@nestjs/schedule`, no broker — this is
 * exactly the kind of periodic task that policy calls for. `pruneOlderThan`
 * is the actual logic, independently testable without touching the clock;
 * `handleCron` is just its daily trigger.
 */
@Injectable()
export class AuditRetentionService {
  constructor(
    @Inject(AUDIT_RETENTION_PRUNER) private readonly pruner: AuditRetentionPruner,
    private readonly env: EnvService,
    private readonly logger: StructuredLogger,
  ) {}

  async pruneOlderThan(now: Date = new Date()): Promise<RetentionResult> {
    const auditCutoff = daysBefore(now, this.env.get('AUDIT_LOG_RETENTION_DAYS'));
    const requestCutoff = daysBefore(now, this.env.get('REQUEST_LOG_RETENTION_DAYS'));

    const [auditLogDeleted, requestLogDeleted] = await Promise.all([
      this.pruner.pruneAuditLog(auditCutoff),
      this.pruner.pruneRequestLog(requestCutoff),
    ]);

    this.logger.log(
      `Retention: pruned ${auditLogDeleted} AuditLog row(s) and ${requestLogDeleted} RequestLog row(s)`,
      AuditRetentionService.name,
    );

    return { auditLogDeleted, requestLogDeleted };
  }

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async handleCron(): Promise<void> {
    await this.pruneOlderThan();
  }
}

function daysBefore(date: Date, days: number): Date {
  return new Date(date.getTime() - days * MS_PER_DAY);
}
