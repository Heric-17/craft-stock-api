import type { AuditOperation } from '../../domain/audit-operation';

export interface FieldChangeView {
  old: unknown;
  new: unknown;
}

export interface AuditTrailEntryView {
  id: string;
  occurredAt: string;
  transactionId: string;
  userId: string | null;
  route: string;
  httpMethod: string;
  correlationId: string;
  entityType: string;
  entityId: string;
  entityLabel: string | null;
  operation: AuditOperation;
  changes: Record<string, FieldChangeView>;
  intent: string | null;
}

export interface RequestLogView {
  id: string;
  transactionId: string;
  occurredAt: string;
  route: string;
  httpMethod: string;
  userId: string | null;
  correlationId: string;
  statusCode: number;
  durationMs: number;
  errorId: string | null;
}

export interface AuditTrailPageView {
  items: AuditTrailEntryView[];
  total: number;
  limit: number;
  offset: number;
}

export interface InvestigationView {
  request: RequestLogView | null;
  writes: AuditTrailEntryView[];
}
