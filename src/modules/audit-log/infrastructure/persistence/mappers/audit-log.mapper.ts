import type { AuditOperation } from '../../../domain/audit-operation';
import type {
  AuditTrailEntry,
  FieldChange,
  RequestLogEntry,
} from '../../../domain/audit-trail-reader';

interface AuditLogRow {
  id: string;
  occurredAt: Date;
  transactionId: string;
  userId: string | null;
  route: string;
  httpMethod: string;
  correlationId: string;
  entityType: string;
  entityId: string;
  entityLabel: string | null;
  operation: string;
  changes: unknown;
  intent: string | null;
}

interface RequestLogRow {
  id: string;
  transactionId: string;
  occurredAt: Date;
  route: string;
  httpMethod: string;
  userId: string | null;
  correlationId: string;
  statusCode: number;
  durationMs: number;
  errorId: string | null;
}

export const AuditLogMapper = {
  toDomain(row: AuditLogRow): AuditTrailEntry {
    return {
      id: row.id,
      occurredAt: row.occurredAt,
      transactionId: row.transactionId,
      userId: row.userId,
      route: row.route,
      httpMethod: row.httpMethod,
      correlationId: row.correlationId,
      entityType: row.entityType,
      entityId: row.entityId,
      entityLabel: row.entityLabel,
      operation: row.operation as AuditOperation,
      changes: row.changes as Record<string, FieldChange>,
      intent: row.intent,
    };
  },

  requestLogToDomain(row: RequestLogRow): RequestLogEntry {
    return {
      id: row.id,
      transactionId: row.transactionId,
      occurredAt: row.occurredAt,
      route: row.route,
      httpMethod: row.httpMethod,
      userId: row.userId,
      correlationId: row.correlationId,
      statusCode: row.statusCode,
      durationMs: row.durationMs,
      errorId: row.errorId,
    };
  },
};
