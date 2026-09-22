import { Money } from '../../../../shared/domain/money/money';
import type {
  PurchaseAnalyticsPort,
  SpendingByPeriod,
  SpendingByPeriodQuery,
  SpendingGranularity,
} from '../../domain/ports/purchase-analytics.port';
import type { InMemoryPurchaseRepository } from '../persistence/in-memory-purchase.repository';

/**
 * In-memory `PurchaseAnalyticsPort` for `application/` tests. Aggregates over
 * whatever the in-memory repository holds, so a test writes purchases through
 * the repository and reads the dataset through the port, exactly as the
 * Prisma pair does. Never mocks Prisma.
 */
export class InMemoryPurchaseAnalyticsAdapter implements PurchaseAnalyticsPort {
  constructor(private readonly purchases: InMemoryPurchaseRepository) {}

  async spendingByPeriod(query: SpendingByPeriodQuery): Promise<SpendingByPeriod[]> {
    const buckets = new Map<string, { netSpend: Money; discountTotal: Money }>();
    const all = await this.purchases.findAll();

    for (const purchase of all) {
      if (purchase.purchaseDate < query.from || purchase.purchaseDate >= query.to) {
        continue;
      }

      // A purchase whose manual attribution is still pending has only part of
      // its discount placed, so the period it falls in cannot be computed yet.
      if (!purchase.isCountedInSpending) {
        continue;
      }

      const period = formatPeriod(purchase.purchaseDate, query.granularity);
      const bucket = buckets.get(period) ?? { netSpend: Money.zero(), discountTotal: Money.zero() };
      const companyLines = purchase.items.filter((item) => item.isCompanyExpense);

      buckets.set(period, {
        netSpend: companyLines.reduce((total, item) => total.plus(item.netValue), bucket.netSpend),
        // The savings of the period are the discount attributed to company
        // lines, never the note's whole header discount: that would credit
        // the company with a saving made on a personal item.
        discountTotal: companyLines.reduce(
          (total, item) => total.plus(item.allocatedDiscount),
          bucket.discountTotal,
        ),
      });
    }

    return [...buckets.entries()]
      .map(([period, totals]) => ({ period, ...totals }))
      .sort((a, b) => a.period.localeCompare(b.period));
  }
}

function formatPeriod(date: Date, granularity: SpendingGranularity): string {
  const iso = date.toISOString();

  return granularity === 'MONTH' ? iso.slice(0, 7) : iso.slice(0, 10);
}
