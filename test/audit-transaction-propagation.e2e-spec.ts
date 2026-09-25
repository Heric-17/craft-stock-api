import { randomUUID } from 'node:crypto';

import { Test, type TestingModule } from '@nestjs/testing';

import { EnvModule } from '../src/config/env.module';
import { RequestContextService } from '../src/shared/infrastructure/logging/request-context.service';
import { PrismaModule } from '../src/shared/infrastructure/prisma/prisma.module';
import { PRISMA_CLIENT } from '../src/shared/infrastructure/prisma/prisma-client.token';
import type { PrismaService } from '../src/shared/infrastructure/prisma/prisma.service';
import { PrismaTransactionContextService } from '../src/shared/infrastructure/prisma/prisma-transaction-context.service';

/**
 * Permanent regression coverage for the one fact the whole audit-extension
 * design depends on, pinned down against real Postgres (not assumed, not
 * mocked): a pre-read issued through the transaction client propagated by
 * `PrismaTransactionContextService` sees uncommitted writes made earlier in
 * that same, still-open transaction.
 *
 * This is NOT incidental coverage. Two approaches that look like they should
 * give the extension a transaction-aware client do not, and neither errors
 * when it fails — see the decision comment in `audit.extension.ts`:
 *   - `Prisma.getExtensionContext(this)` is a no-op in this Prisma version.
 *   - Querying through the closured top-level extended client from inside
 *     the hook silently returns a stale snapshot instead of the live one.
 * If `PrismaTransactionContextService` propagation is ever "simplified" back
 * toward either of those, this file is what catches it — the failure mode
 * it prevents is silent (a wrong-but-plausible "before" value), so losing
 * this coverage would not show up any other way.
 *
 * Built through the real `PrismaModule` (via Nest's `TestingModule`) rather
 * than a hand-rolled `PrismaClient`, for two reasons: it exercises the exact
 * production wiring instead of a parallel construction that could drift from
 * it, and it keeps this file from needing to import Prisma's generated
 * client directly — restricted, by lint rule, to `infrastructure/` (§12).
 */
describe('audit extension — transaction propagation (regression)', () => {
  let moduleRef: TestingModule;
  let prismaClient: PrismaService;
  let requestContext: RequestContextService;
  let txContext: PrismaTransactionContextService;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({ imports: [EnvModule, PrismaModule] }).compile();
    await moduleRef.init();

    prismaClient = moduleRef.get(PRISMA_CLIENT);
    requestContext = moduleRef.get(RequestContextService);
    txContext = moduleRef.get(PrismaTransactionContextService);
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  function materialData(id: string, overrides: Record<string, unknown> = {}) {
    return {
      id,
      name: 'Regression Material',
      packageCost: '10.00',
      packageQuantity: '1000.000',
      consumptionUnit: 'GRAM' as const,
      stockQuantity: '1000.000',
      minimumStockAlert: '100.000',
      ...overrides,
    };
  }

  async function runRolledBack(work: () => Promise<void>): Promise<void> {
    try {
      await prismaClient.$transaction((tx) => txContext.run(tx, work));
    } catch (error) {
      if ((error as Error).message !== 'ROLLBACK_FOR_TEST') {
        throw error;
      }
    }
  }

  it('an update pre-read sees a row created earlier in the same uncommitted transaction', async () => {
    const id = randomUUID();
    let auditRow: { operation: string; changes: unknown } | null = null;

    await requestContext.run(
      { correlationId: 'regression-update', transactionId: 'regression-txn-update' },
      async () => {
        await runRolledBack(async () => {
          const tx = txContext.current!;
          await tx.material.create({ data: materialData(id) });

          // The operation whose pre-read this test exists to pin down. If the
          // pre-read did NOT see the transaction's own uncommitted CREATE, this
          // UPDATE's audit row would show `old: null` for every field, as if it
          // were itself a CREATE.
          await tx.material.update({ where: { id }, data: { name: 'Updated' } });

          auditRow = await tx.auditLog.findFirst({ where: { entityId: id, operation: 'UPDATE' } });
          throw new Error('ROLLBACK_FOR_TEST');
        });
      },
    );

    expect(auditRow).toMatchObject({
      operation: 'UPDATE',
      changes: { name: { old: 'Regression Material', new: 'Updated' } },
    });
  });

  it('a delete pre-read sees a row created earlier in the same uncommitted transaction', async () => {
    const id = randomUUID();
    let auditRow: { operation: string; changes: unknown } | null = null;

    await requestContext.run(
      { correlationId: 'regression-delete', transactionId: 'regression-txn-delete' },
      async () => {
        await runRolledBack(async () => {
          const tx = txContext.current!;
          await tx.material.create({ data: materialData(id) });
          await tx.material.delete({ where: { id } });

          auditRow = await tx.auditLog.findFirst({ where: { entityId: id, operation: 'DELETE' } });
          throw new Error('ROLLBACK_FOR_TEST');
        });
      },
    );

    // A DELETE audit row only gets written when the pre-read actually found
    // a "before" row (see writeAuditRow's guard in the extension) — so a
    // pre-read blind to the uncommitted CREATE would mean this is null.
    expect(auditRow).toMatchObject({
      operation: 'DELETE',
      changes: { name: { old: 'Regression Material', new: null } },
    });
  });

  it('an upsert pre-read correctly resolves to the UPDATE branch for a row created earlier in the same uncommitted transaction', async () => {
    const id = randomUUID();
    let auditRow: { operation: string; changes: unknown } | null = null;

    await requestContext.run(
      { correlationId: 'regression-upsert', transactionId: 'regression-txn-upsert' },
      async () => {
        await runRolledBack(async () => {
          const tx = txContext.current!;
          await tx.material.create({ data: materialData(id) });

          // A pre-read blind to the transaction would see no row here and
          // wrongly classify this as a CREATE instead of an UPDATE.
          await tx.material.upsert({
            where: { id },
            create: materialData(id, { name: 'should not be used' }),
            update: { name: 'Upserted' },
          });

          // Filtered by operation: the initial create() above also produced
          // an audit row for this same entityId, and findFirst with no
          // orderBy does not guarantee which one comes back.
          auditRow = await tx.auditLog.findFirst({ where: { entityId: id, operation: 'UPDATE' } });
          throw new Error('ROLLBACK_FOR_TEST');
        });
      },
    );

    expect(auditRow).toMatchObject({
      operation: 'UPDATE',
      changes: { name: { old: 'Regression Material', new: 'Upserted' } },
    });
  });

  it('rollback removes both the business row and every audit row written for it', async () => {
    const id = randomUUID();

    await requestContext.run(
      { correlationId: 'regression-rollback', transactionId: 'regression-txn-rollback' },
      async () => {
        await runRolledBack(async () => {
          const tx = txContext.current!;
          await tx.material.create({ data: materialData(id) });
          throw new Error('ROLLBACK_FOR_TEST');
        });
      },
    );

    const material = await prismaClient.material.findUnique({ where: { id } });
    const auditRows = await prismaClient.auditLog.findMany({ where: { entityId: id } });

    expect(material).toBeNull();
    expect(auditRows).toEqual([]);
  });
});
