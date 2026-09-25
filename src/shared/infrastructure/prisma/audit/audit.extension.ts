import type { RequestContextService } from '../../logging/request-context.service';
import type { PrismaTransactionContextService } from '../prisma-transaction-context.service';
import type { Prisma } from '../generated/client';
import { buildFieldChanges } from './build-field-changes';
import { resolveEntityLabel } from './entity-label-map';
import { omitSensitiveFields } from './sensitive-fields';

// A Prisma model delegate, narrowed to just the handful of methods this
// extension actually calls. The real generated delegate types are one union
// per model — there is no single type that fits every model generically,
// so the extension deliberately works through this reduced shape instead.
interface AuditableDelegate {
  findUnique(args: { where: unknown }): Promise<Record<string, unknown> | null>;
  findMany(args: { where: unknown }): Promise<Record<string, unknown>[]>;
}

type AuditCapableClient = Prisma.TransactionClient &
  Record<string, unknown> & {
    auditLog: {
      create(args: { data: Record<string, unknown> }): Promise<unknown>;
    };
  };

const WRITE_OPERATIONS = new Set([
  'create',
  'createMany',
  'update',
  'updateMany',
  'upsert',
  'delete',
  'deleteMany',
]);

// Rule 1: auditing AuditLog or RequestLog would recurse (AuditLog) or is
// simply pointless (RequestLog is the request-level record itself, not
// business data).
const EXCLUDED_MODELS = new Set(['AuditLog', 'RequestLog']);

function uncapitalize(model: string): string {
  return model.charAt(0).toLowerCase() + model.slice(1);
}

/**
 * Builds the Prisma query extension that captures every write generically —
 * see CLAUDE.md §15.2. Registered once, in `prisma.module.ts`, via
 * `prismaService.$extends(createAuditExtension(...))`.
 *
 * ---
 * ## Why the pre-read goes through `txContext`, not `Prisma.getExtensionContext(this)`
 *
 * The obvious-looking way to read "the row as it is right now, inside this
 * same operation" from inside `$allOperations` is
 * `Prisma.getExtensionContext(this)`. **Do not use it.** Verified against
 * this project's actual Prisma version (7.10) with a throwaway script
 * against real Postgres, not assumed from docs:
 *
 *   - `Prisma.getExtensionContext` is a no-op identity function in this
 *     version (`(e) => e`). `this` inside `$allModels.$allOperations` is not
 *     a client, not a model delegate, and not a transaction handle — it's an
 *     unrelated array-like internal object with no model properties at all.
 *   - The tempting fallback — calling the *closured top-level extended
 *     client* from inside the hook — compiles, runs, and returns a plausible
 *     result, but is wrong: while a `$transaction(async (tx) => ...)` is in
 *     flight, a query issued through the base client (rather than through
 *     `tx`) is a genuinely separate connection and does not see that
 *     transaction's uncommitted writes. A pre-read done this way silently
 *     returns stale "before" state instead of erroring, which is worse than
 *     a crash: the audit trail would look correct and be wrong.
 *
 * Both of those were tested directly against Postgres before this file was
 * written. If you're tempted to simplify `PrismaTransactionContextService`
 * away and go back to either of them: don't — that regression is exactly
 * what `test/audit-transaction-propagation.e2e-spec.ts` exists to catch, by
 * asserting a pre-read inside an open transaction actually sees a row
 * created earlier in that same, still-uncommitted transaction.
 *
 * The fix is to propagate the transaction client ourselves: `PrismaUnitOfWork`
 * opens a `PrismaTransactionContextService` scope with the real `tx` the
 * moment `$transaction` hands it one, and this extension reads it back from
 * there. Outside any `UnitOfWork` transaction, `txContext.current` is
 * `undefined` and the extension falls back to the closured top-level client —
 * correct there, since there is no transaction to miss.
 */
// Matches Prisma's own `QueryOptionsCbArgs` shape. Written out by hand rather
// than imported: this extension deliberately works generically across every
// model, which is exactly the case Prisma's own generated per-model types
// aren't shaped for.
interface AllOperationsArgs {
  model?: string;
  operation: string;
  args: unknown;
  query: (args: unknown) => Promise<unknown>;
}

export function createAuditExtension(
  requestContext: RequestContextService,
  txContext: PrismaTransactionContextService,
  getFallbackClient: () => AuditCapableClient,
) {
  async function writeAuditRow(
    client: AuditCapableClient,
    model: string,
    operation: 'CREATE' | 'UPDATE' | 'DELETE',
    before: Record<string, unknown> | null,
    after: Record<string, unknown> | null,
  ): Promise<void> {
    const changes = omitSensitiveFields(buildFieldChanges(before, after));
    const entity = after ?? before;
    const entityId = entity?.id;

    if (typeof entityId !== 'string') {
      return;
    }

    const ctx = requestContext.current;

    // Rule 6: a failed audit write must fail the operation with it — no
    // try/catch here. A write with no trace is worse than a rejected write.
    await client.auditLog.create({
      data: {
        transactionId: ctx?.transactionId ?? entityId,
        userId: ctx?.userId ?? null,
        route: ctx?.route ?? 'unknown',
        httpMethod: ctx?.httpMethod ?? 'unknown',
        correlationId: ctx?.correlationId ?? entityId,
        entityType: model,
        entityId,
        entityLabel: resolveEntityLabel(model, entity ?? null),
        operation,
        changes,
        intent: ctx?.intent ?? null,
      },
    });
  }

  async function maybeWriteUpdateRow(
    client: AuditCapableClient,
    model: string,
    before: Record<string, unknown> | null,
    after: Record<string, unknown> | null,
  ): Promise<void> {
    // Rule 3: an update that changed nothing writes no row. buildFieldChanges
    // returning {} is exactly that case, checked before redaction so a
    // no-op update with only a sensitive field "changed" still writes nothing.
    if (Object.keys(buildFieldChanges(before, after)).length === 0) {
      return;
    }

    await writeAuditRow(client, model, 'UPDATE', before, after);
  }

  return {
    name: 'audit-log',
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }: AllOperationsArgs) {
          if (!model || EXCLUDED_MODELS.has(model) || !WRITE_OPERATIONS.has(operation)) {
            return query(args);
          }

          const client = (txContext.current ?? getFallbackClient()) as AuditCapableClient;
          const delegate = client[uncapitalize(model)] as AuditableDelegate;
          const writeArgs = args as { where?: unknown; data?: unknown };

          switch (operation) {
            case 'create': {
              const result = await query(args);
              await writeAuditRow(client, model, 'CREATE', null, result as Record<string, unknown>);
              return result;
            }

            case 'createMany': {
              const rows = Array.isArray(writeArgs.data) ? writeArgs.data : [writeArgs.data];
              const result = await query(args);
              for (const row of rows as Record<string, unknown>[]) {
                await writeAuditRow(client, model, 'CREATE', null, row);
              }
              return result;
            }

            case 'update': {
              const before = await delegate.findUnique({ where: writeArgs.where });
              const result = await query(args);
              await maybeWriteUpdateRow(client, model, before, result as Record<string, unknown>);
              return result;
            }

            case 'upsert': {
              const before = await delegate.findUnique({ where: writeArgs.where });
              const result = await query(args);
              if (before) {
                await maybeWriteUpdateRow(client, model, before, result as Record<string, unknown>);
              } else {
                await writeAuditRow(
                  client,
                  model,
                  'CREATE',
                  null,
                  result as Record<string, unknown>,
                );
              }
              return result;
            }

            case 'delete': {
              const before = await delegate.findUnique({ where: writeArgs.where });
              const result = await query(args);
              if (before) {
                await writeAuditRow(client, model, 'DELETE', before, null);
              }
              return result;
            }

            case 'updateMany': {
              const beforeRows = await delegate.findMany({ where: writeArgs.where });
              const result = await query(args);

              if (beforeRows.length > 0) {
                const ids = beforeRows.map((row) => row.id);
                // Re-queried rather than computed from `args.data` in memory:
                // Prisma update payloads can carry relative operations (e.g.
                // `{ increment: 1 }`) that can't be applied by hand here.
                const afterRows = await delegate.findMany({ where: { id: { in: ids } } });
                const afterById = new Map(afterRows.map((row) => [row.id, row]));

                for (const before of beforeRows) {
                  await maybeWriteUpdateRow(
                    client,
                    model,
                    before,
                    afterById.get(before.id) ?? null,
                  );
                }
              }

              return result;
            }

            case 'deleteMany': {
              const beforeRows = await delegate.findMany({ where: writeArgs.where });
              const result = await query(args);

              for (const before of beforeRows) {
                await writeAuditRow(client, model, 'DELETE', before, null);
              }

              return result;
            }

            default:
              return query(args);
          }
        },
      },
    },
  };
}
