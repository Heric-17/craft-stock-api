import type { RepositoryContext, UnitOfWork } from '../../domain/persistence/unit-of-work';

/**
 * Fake `UnitOfWork` for `application/` tests. Runs `work` directly against
 * the same in-memory repository instances the test wired up — no rollback
 * semantics, since there is no real transaction to roll back.
 */
export class InMemoryUnitOfWork implements UnitOfWork {
  constructor(private readonly context: RepositoryContext) {}

  async runInTransaction<T>(work: (ctx: RepositoryContext) => Promise<T>): Promise<T> {
    return work(this.context);
  }
}
