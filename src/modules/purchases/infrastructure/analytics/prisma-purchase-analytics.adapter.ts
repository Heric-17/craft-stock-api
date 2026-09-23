import { Inject, Injectable } from '@nestjs/common';

import { Money } from '../../../../shared/domain/money/money';
import { toDomainMoney } from '../../../../shared/infrastructure/persistence/money.mapper';
import type { Prisma } from '../../../../shared/infrastructure/prisma/generated/client';
import { PrismaService } from '../../../../shared/infrastructure/prisma/prisma.service';
import { establishmentIdOf } from '../../domain/establishment';
import type {
  PurchaseAnalyticsPort,
  SpendingByEstablishment,
  SpendingByPeriod,
  SpendingDataset,
  SpendingDatasetQuery,
  SpendingTotals,
} from '../../domain/ports/purchase-analytics.port';
import { formatSpendingPeriod } from '../../domain/spending-period';
import { toWhere } from '../persistence/prisma-purchase.repository';

/** The purchase attributes the dataset groups by, and nothing else. */
interface PurchaseDimensions {
  purchaseDate: Date;
  merchantName: string | null;
  merchantCnpj: string | null;
}

/** A slice being accumulated. `Money` is immutable, so each add replaces it. */
interface Accumulator extends SpendingTotals {
  establishmentName: string | null;
}

@Injectable()
export class PrismaPurchaseAnalyticsAdapter implements PurchaseAnalyticsPort {
  constructor(@Inject(PrismaService) private readonly prisma: Prisma.TransactionClient) {}

  /**
   * The whole spending dataset, in two queries: what each purchase's company
   * lines add up to, and the attributes those sums are grouped by.
   *
   * The per-purchase sums come from `groupBy` with `_sum`, filtered through
   * the relation so the period predicate is applied in the database rather
   * than by handing it a list of ids. It groups by `purchaseId` and not
   * straight into months because the two figures wanted are sums of an
   * expression — `grossValue − allocatedDiscount` — over a column that lives
   * on the other table, and neither of those is something `groupBy` can
   * express. Summing the two columns separately and subtracting is exact,
   * both being decimals, and the fold into periods and shops happens here
   * over one row per purchase.
   *
   * Two filters are load-bearing. Only company-expense lines are counted:
   * the panel answers what left the business's till, so a personal item on
   * the same note contributes neither spending nor saving. And purchases
   * whose `MANUAL` attribution is still pending are excluded, because only
   * part of their discount has been placed and the period would report a
   * figure that is wrong and looks complete.
   */
  async spendingDataset(query: SpendingDatasetQuery): Promise<SpendingDataset> {
    const purchaseWhere: Prisma.PurchaseWhereInput = {
      ...toWhere({ from: query.from, to: query.to, establishmentId: query.establishmentId }),
      allocationPending: false,
    };

    const [sums, purchases] = await Promise.all([
      this.prisma.purchaseItem.groupBy({
        by: ['purchaseId'],
        where: { isCompanyExpense: true, purchase: purchaseWhere },
        _sum: { grossValue: true, allocatedDiscount: true },
      }),
      this.prisma.purchase.findMany({
        where: purchaseWhere,
        select: { id: true, purchaseDate: true, merchantName: true, merchantCnpj: true },
      }),
    ]);

    const dimensions = new Map<string, PurchaseDimensions>(
      purchases.map((purchase) => [purchase.id, purchase]),
    );

    const byPeriod = new Map<string, Accumulator>();
    const byEstablishment = new Map<string, Accumulator>();

    for (const row of sums) {
      const purchase = dimensions.get(row.purchaseId);

      // The two queries are filtered identically, so this can only happen if
      // a purchase was written between them. It contributes nothing rather
      // than landing in a bucket whose period is unknown.
      if (purchase === undefined) {
        continue;
      }

      const gross =
        row._sum.grossValue === null ? Money.zero() : toDomainMoney(row._sum.grossValue);
      const discount =
        row._sum.allocatedDiscount === null
          ? Money.zero()
          : toDomainMoney(row._sum.allocatedDiscount);
      const totals = { netSpend: gross.minus(discount), discountTotal: discount };

      const establishmentId = establishmentIdOf(purchase.merchantName, purchase.merchantCnpj);

      accumulate(
        byPeriod,
        formatSpendingPeriod(purchase.purchaseDate, query.granularity),
        totals,
        null,
      );
      accumulate(byEstablishment, establishmentId ?? '', totals, purchase.merchantName);
    }

    return {
      from: query.from,
      to: query.to,
      granularity: query.granularity,
      byPeriod: toPeriodDimension(byPeriod),
      byEstablishment: toEstablishmentDimension(byEstablishment),
    };
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

/** Ranked by what was spent, which is the order the panel reads it in. */
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
