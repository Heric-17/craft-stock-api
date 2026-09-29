import type { AuditOperation } from './audit-operation';

export interface FieldChange {
  old: unknown;
  new: unknown;
}

export interface AuditTrailEntry {
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
  operation: AuditOperation;
  changes: Record<string, FieldChange>;
  intent: string | null;
}

export interface RequestLogEntry {
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
  /**
   * Why the request failed, present only when it did. On the request record
   * itself rather than in a table of its own, so one investigation query
   * returns the cause, the request and its writes together.
   */
  errorType: string | null;
  errorMessage: string | null;
  stackTrace: string | null;
  errorContext: string | null;
}

export interface Page<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

export interface AuditTrailFilter {
  entityType?: string;
  entityId?: string;
  transactionId?: string;
  operation?: AuditOperation;
  limit: number;
  offset: number;
}

export interface UserActivityFilter {
  limit: number;
  offset: number;
}

export interface InvestigationKey {
  transactionId?: string;
  correlationId?: string;
  errorId?: string;
}

export interface Investigation {
  request: RequestLogEntry | null;
  writes: AuditTrailEntry[];
}

/**
 * Read-only, dataset-shaped port over the audit trail (§6.6, §7) — never a
 * repository: nothing here saves, updates, or deletes anything, because
 * application code never writes an AuditLog row directly (§15.2, the Prisma
 * extension is the only writer). Deliberately not named
 * `AuditLogRepository` — the architecture test in `architecture.spec.ts`
 * enforces that no such thing gets declared.
 */
export const AUDIT_TRAIL_READER = Symbol('AUDIT_TRAIL_READER');

export interface AuditTrailReader {
  /** The technical trail: filterable, paginated, every column exposed. */
  search(filter: AuditTrailFilter): Promise<Page<AuditTrailEntry>>;
  /** The user-facing feed, restricted to `USER_RELEVANT_ENTITY_TYPES`. */
  findUserActivity(filter: UserActivityFilter): Promise<Page<AuditTrailEntry>>;
  /**
   * Resolves a RequestLog row by transactionId, correlationId, or errorId —
   * with the cause of its failure, when it failed — plus every write it made,
   * in order.
   */
  investigate(key: InvestigationKey): Promise<Investigation>;
}
