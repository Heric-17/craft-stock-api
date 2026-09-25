import { Inject, Injectable } from '@nestjs/common';

import { AUDIT_TRAIL_READER, type AuditTrailReader } from '../../domain/audit-trail-reader';
import type { AuditOperation } from '../../domain/audit-operation';
import type { AuditTrailPageView, InvestigationView } from '../dto/audit-log.dto';
import { AuditLogViewMapper } from '../mappers/audit-log-view.mapper';

export const DEFAULT_AUDIT_LOG_PAGE_SIZE = 20;
export const MAX_AUDIT_LOG_PAGE_SIZE = 100;

export interface SearchAuditLogInput {
  entityType?: string;
  entityId?: string;
  transactionId?: string;
  operation?: AuditOperation;
  limit?: number;
  offset?: number;
}

export interface AuditActivityInput {
  limit?: number;
  offset?: number;
}

export interface InvestigateInput {
  transactionId?: string;
  correlationId?: string;
  errorId?: string;
}

@Injectable()
export class AuditLogService {
  constructor(@Inject(AUDIT_TRAIL_READER) private readonly reader: AuditTrailReader) {}

  async search(input: SearchAuditLogInput): Promise<AuditTrailPageView> {
    const page = await this.reader.search({
      entityType: input.entityType,
      entityId: input.entityId,
      transactionId: input.transactionId,
      operation: input.operation,
      limit: input.limit ?? DEFAULT_AUDIT_LOG_PAGE_SIZE,
      offset: input.offset ?? 0,
    });

    return AuditLogViewMapper.toPageView(page);
  }

  async findUserActivity(input: AuditActivityInput): Promise<AuditTrailPageView> {
    const page = await this.reader.findUserActivity({
      limit: input.limit ?? DEFAULT_AUDIT_LOG_PAGE_SIZE,
      offset: input.offset ?? 0,
    });

    return AuditLogViewMapper.toPageView(page);
  }

  async investigate(input: InvestigateInput): Promise<InvestigationView> {
    const investigation = await this.reader.investigate(input);

    return AuditLogViewMapper.toInvestigationView(investigation);
  }
}
