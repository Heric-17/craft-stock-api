import { Money } from '../../../../shared/domain/money/money';
import { establishmentIdOf } from '../../domain/establishment';
import type {
  PurchaseAnalyticsPort,
  SpendingByEstablishment,
  SpendingByPeriod,
  SpendingDataset,
  SpendingDatasetQuery,
  SpendingTotals,
} from '../../domain/ports/purchase-analytics.port';
import type { Purchase } from '../../domain/purchase.entity';
import { formatSpendingPeriod } from '../../domain/spending-period';
import type { InMemoryPurchaseRepository } from '../persistence/in-memory-purchase.repository';

interface Accumulator extends SpendingTotals {
  establishmentName: string | null;
}

/**
 * In-memory `PurchaseAnalyticsPort` for `application/` tests. Aggregates over
 * whatever the in-memory repository holds, so a test writes purchases through
 * the repository and reads the dataset through the port, exactly as the
 * Prisma pair does. Never mocks Prisma.
 *
 * It applies the same three rules as the real adapter, because those rules
 * are the contract and not an implementation detail: only company-expense
 * lines count, spending is the net side of them, and a purchase with a
 * pending manual attribution is left out entirely.
 */
export class InMemoryPurchaseAnalyticsAdapter implements PurchaseAnalyticsPort {
  constructor(private readonly purchases: InMemoryPurchaseRepository) {}

  async spendingDataset(query: SpendingDatasetQuery): Promise<SpendingDataset> {
    const byPeriod = new Map<string, Accumulator>();
    const byEstablishment = new Map<string, Accumulator>();

    for (const purchase of await this.purchases.findAll()) {
      if (!this.isInScope(purchase, query)) {
        continue;
      }

      const companyLines = purchase.items.filter((item) => item.isCompanyExpense);

      // A note that is entirely personal spent nothing on the company's
      // behalf, so it is not a purchase this panel has seen.
      if (companyLines.length === 0) {
        continue;
      }

      const totals = companyLines.reduce(
        (running, item) => ({
          netSpend: running.netSpend.plus(item.netValue),
          // The saving of the period is the discount attributed to company
          // lines, never the note's whole header discount: that would credit
          // the business with a saving made on a personal item.
          discountTotal: running.discountTotal.plus(item.allocatedDiscount),
        }),
        { netSpend: Money.zero(), discountTotal: Money.zero() },
      );

      const establishmentId = purchase.establishment?.id ?? null;

      accumulate(
        byPeriod,
        formatSpendingPeriod(purchase.purchaseDate, query.granularity),
        totals,
        null,
      );
      accumulate(
        byEstablishment,
        establishmentId ?? '',
        totals,
        purchase.establishment?.name ?? null,
      );
    }

    return {
      from: query.from,
      to: query.to,
      granularity: query.granularity,
      byPeriod: toPeriodDimension(byPeriod),
      byEstablishment: toEstablishmentDimension(byEstablishment),
    };
  }

  private isInScope(purchase: Purchase, query: SpendingDatasetQuery): boolean {
    if (purchase.purchaseDate < query.from || purchase.purchaseDate >= query.to) {
      return false;
    }

    // A purchase whose manual attribution is still pending has only part of
    // its discount placed, so the period it falls in cannot be computed yet.
    if (!purchase.isCountedInSpending) {
      return false;
    }

    if (query.establishmentId === undefined) {
      return true;
    }

    return (
      establishmentIdOf(
        purchase.establishment?.name ?? null,
        purchase.establishment?.cnpj ?? null,
      ) === query.establishmentId
    );
  }
}

function accumulate(
  buckets: Map<string, Accumulator>,
  key: string,
  totals: { netSpend: Money; discountTotal: Money },
  establishmentName: string | null,
): void {
  const current = buckets.get(key);

  if (current === undefined) {
    buckets.set(key, { ...totals, purchaseCount: 1, establishmentName });
    return;
  }

  buckets.set(key, {
    netSpend: current.netSpend.plus(totals.netSpend),
    discountTotal: current.discountTotal.plus(totals.discountTotal),
    purchaseCount: current.purchaseCount + 1,
    establishmentName: current.establishmentName ?? establishmentName,
  });
}

function toPeriodDimension(buckets: Map<string, Accumulator>): SpendingByPeriod[] {
  return [...buckets.entries()]
    .map(([period, totals]) => ({
      period,
      netSpend: totals.netSpend,
      discountTotal: totals.discountTotal,
      purchaseCount: totals.purchaseCount,
    }))
    .sort((a, b) => a.period.localeCompare(b.period));
}

function toEstablishmentDimension(buckets: Map<string, Accumulator>): SpendingByEstablishment[] {
  return [...buckets.entries()]
    .map(([establishmentId, totals]) => ({
      establishmentId: establishmentId === '' ? null : establishmentId,
      establishmentName: totals.establishmentName,
      netSpend: totals.netSpend,
      discountTotal: totals.discountTotal,
      purchaseCount: totals.purchaseCount,
    }))
    .sort((a, b) => b.netSpend.toCents() - a.netSpend.toCents());
}
