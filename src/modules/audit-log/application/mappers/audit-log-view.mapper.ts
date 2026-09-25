import type {
  AuditTrailEntry,
  Investigation,
  Page,
  RequestLogEntry,
} from '../../domain/audit-trail-reader';
import type {
  AuditTrailEntryView,
  AuditTrailPageView,
  InvestigationView,
  RequestLogView,
} from '../dto/audit-log.dto';

export const AuditLogViewMapper = {
  toEntryView(entry: AuditTrailEntry): AuditTrailEntryView {
    return { ...entry, occurredAt: entry.occurredAt.toISOString() };
  },

  toPageView(page: Page<AuditTrailEntry>): AuditTrailPageView {
    return {
      items: page.items.map((entry) => AuditLogViewMapper.toEntryView(entry)),
      total: page.total,
      limit: page.limit,
      offset: page.offset,
    };
  },

  toRequestLogView(entry: RequestLogEntry): RequestLogView {
    return { ...entry, occurredAt: entry.occurredAt.toISOString() };
  },

  toInvestigationView(investigation: Investigation): InvestigationView {
    return {
      request: investigation.request
        ? AuditLogViewMapper.toRequestLogView(investigation.request)
        : null,
      writes: investigation.writes.map((entry) => AuditLogViewMapper.toEntryView(entry)),
    };
  },
};
