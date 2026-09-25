import { BadRequestException, Controller, Get, Query } from '@nestjs/common';

import type { AuditTrailPageView, InvestigationView } from '../application/dto/audit-log.dto';
import { AuditLogService } from '../application/services/audit-log.service';
import { AuditActivityQueryDto } from './dto/audit-activity-query.dto';
import { InvestigateAuditLogQueryDto } from './dto/investigate-audit-log-query.dto';
import { SearchAuditLogQueryDto } from './dto/search-audit-log-query.dto';

/**
 * Read-only endpoints over the audit trail (§15.2). Primarily an
 * investigation tool — `activity` is the one exception, feeding a
 * user-facing feed restricted to `USER_RELEVANT_ENTITY_TYPES`.
 */
@Controller('audit-log')
export class AuditLogController {
  constructor(private readonly auditLog: AuditLogService) {}

  @Get()
  search(@Query() query: SearchAuditLogQueryDto): Promise<AuditTrailPageView> {
    return this.auditLog.search(query);
  }

  @Get('activity')
  activity(@Query() query: AuditActivityQueryDto): Promise<AuditTrailPageView> {
    return this.auditLog.findUserActivity(query);
  }

  @Get('investigate')
  investigate(@Query() query: InvestigateAuditLogQueryDto): Promise<InvestigationView> {
    if (!query.transactionId && !query.correlationId && !query.errorId) {
      throw new BadRequestException('Provide transactionId, correlationId, or errorId.');
    }

    return this.auditLog.investigate(query);
  }
}
