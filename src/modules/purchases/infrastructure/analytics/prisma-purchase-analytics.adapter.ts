import { Inject, Injectable } from '@nestjs/common';

import { Money } from '../../../../shared/domain/money/money';
import type { Prisma } from '../../../../shared/infrastructure/prisma/generated/client';
import { PrismaService } from '../../../../shared/infrastructure/prisma/prisma.service';
import type {
  PurchaseAnalyticsPort,
  SpendingByPeriod,
  SpendingByPeriodQuery,
  SpendingGranularity,
} from '../../domain/ports/purchase-analytics.port';

/** Shape of one aggregated row as Postgres returns it. */
interface SpendingRow {
  bucket: Date | string;
  netSpend: Prisma.Decimal | string | number | null;
  discountTotal: Prisma.Decimal | string | number | null;
}

@Injectable()
export class PrismaPurchaseAnalyticsAdapter implements PurchaseAnalyticsPort {
  constructor(@Inject(PrismaService) private readonly prisma: Prisma.TransactionClient) {}

  /**
   * Both figures are summed over the company-expense lines, in one pass.
   *
   * Spending is `grossValue − allocatedDiscount` per line, which is the line's
   * net value — derived here rather than read from a column, exactly as the
   * domain derives it.
   *
   * Savings is the sum of `allocatedDiscount` over those same lines, and
   * deliberately not the notes' `discountTotal`: counting the whole header
   * discount would credit the company with savings obtained on a personal
   * item sharing the same note.
   *
   * Purchases whose manual attribution is still pending are left out. Their
   * discount is only partly attributed, so including them would report a
   * period as having spent more than it did, with nothing to show for it.
   */
  async spendingByPeriod(query: SpendingByPeriodQuery): Promise<SpendingByPeriod[]> {
    const unit = query.granularity === 'MONTH' ? 'month' : 'day';

    const rows = await this.prisma.$queryRaw<SpendingRow[]>`
      SELECT
        date_trunc(${unit}::text, p."purchaseDate") AS "bucket",
        COALESCE(SUM(i."grossValue" - i."allocatedDiscount"), 0) AS "netSpend",
        COALESCE(SUM(i."allocatedDiscount"), 0) AS "discountTotal"
      FROM "PurchaseItem" AS i
      JOIN "Purchase" AS p ON p."id" = i."purchaseId"
      WHERE p."purchaseDate" >= ${query.from}
        AND p."purchaseDate" < ${query.to}
        AND p."allocationPending" = FALSE
        AND i."isCompanyExpense" = TRUE
      GROUP BY 1
      ORDER BY 1
    `;

    return rows.map((row) => ({
      period: formatPeriod(row.bucket, query.granularity),
      netSpend: toMoney(row.netSpend),
      discountTotal: toMoney(row.discountTotal),
    }));
  }
}

/**
 * A raw aggregate arrives as whatever the driver decided to hand back for a
 * `numeric` — `Decimal`, string or number. All three carry the same digits,
 * and the decimal string is the one representation `Money` accepts without
 * passing through a float.
 */
function toMoney(value: Prisma.Decimal | string | number | null): Money {
  if (value === null) {
    return Money.zero();
  }

  return Money.fromDecimalString(value.toString());
}

function formatPeriod(bucket: Date | string, granularity: SpendingGranularity): string {
  const iso = bucket instanceof Date ? bucket.toISOString() : new Date(bucket).toISOString();

  return granularity === 'MONTH' ? iso.slice(0, 7) : iso.slice(0, 10);
}
