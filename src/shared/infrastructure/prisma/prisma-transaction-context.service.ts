import { AsyncLocalStorage } from 'node:async_hooks';

import { Injectable } from '@nestjs/common';

import type { Prisma } from './generated/client';

/**
 * Carries "the client bound to the currently-open transaction" through the
 * async call stack, so the audit extension can find it without Prisma's own
 * help — it doesn't offer any. `PrismaUnitOfWork` opens a scope with the
 * `tx` it gets from `$transaction`; the audit extension reads it back.
 *
 * This exists because the two approaches that look like they should work,
 * don't (verified against real Postgres, not assumed — see the decision
 * comment in `audit/audit.extension.ts` for the full story and the
 * regression test that pins it down):
 *   - `Prisma.getExtensionContext(this)` inside `$allOperations` is a no-op
 *     in this Prisma version and `this` isn't a client at all.
 *   - Querying through the closured top-level extended client from inside
 *     the hook silently returns the wrong thing: a snapshot that doesn't
 *     include uncommitted writes from the transaction currently in flight,
 *     with no error to say so.
 * Outside any `UnitOfWork` transaction (`current` is `undefined`), callers
 * fall back to the top-level client themselves — see the extension.
 */
@Injectable()
export class PrismaTransactionContextService {
  private readonly storage = new AsyncLocalStorage<Prisma.TransactionClient>();

  run<T>(tx: Prisma.TransactionClient, callback: () => T): T {
    return this.storage.run(tx, callback);
  }

  get current(): Prisma.TransactionClient | undefined {
    return this.storage.getStore();
  }
}
