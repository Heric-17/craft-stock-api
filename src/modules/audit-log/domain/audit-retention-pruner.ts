export const AUDIT_RETENTION_PRUNER = Symbol('AUDIT_RETENTION_PRUNER');

/** Deletes rows older than a cutoff. Nothing else — no business rule to speak of. */
export interface AuditRetentionPruner {
  pruneAuditLog(olderThan: Date): Promise<number>;
  pruneRequestLog(olderThan: Date): Promise<number>;
}
