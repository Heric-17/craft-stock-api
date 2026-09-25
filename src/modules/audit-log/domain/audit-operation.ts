/** Mirrors the database enum by value, deliberately not by import (§12: no Prisma-generated type crosses into domain/). */
export type AuditOperation = 'CREATE' | 'UPDATE' | 'DELETE';
