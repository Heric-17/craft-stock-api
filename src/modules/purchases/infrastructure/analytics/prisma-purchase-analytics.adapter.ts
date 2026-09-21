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
   * Spending and discount are summed in two separate passes and joined on the
   * bucket afterwards. Summing both in one pass over the join would multiply
   * each note's header discount by its number of lines.
   */
  async spendingByPeriod(query: SpendingByPeriodQuery): Promise<SpendingByPeriod[]> {
    const unit = query.granularity === 'MONTH' ? 'month' : 'day';

    const rows = await this.prisma.$queryRaw<SpendingRow[]>`
      WITH spend AS (
        SELECT
          date_trunc(${unit}::text, p."purchaseDate") AS bucket,
          SUM(i."netValue") AS total
        FROM "PurchaseItem" AS i
        JOIN "Purchase" AS p ON p."id" = i."purchaseId"
        WHERE p."purchaseDate" >= ${query.from}
          AND p."purchaseDate" < ${query.to}
          AND i."isCompanyExpense" = TRUE
        GROUP BY 1
      ),
      discount AS (
        SELECT
          date_trunc(${unit}::text, p."purchaseDate") AS bucket,
          SUM(p."discountTotal") AS total
        FROM "Purchase" AS p
        WHERE p."purchaseDate" >= ${query.from}
          AND p."purchaseDate" < ${query.to}
        GROUP BY 1
      )
      SELECT
        COALESCE(spend.bucket, discount.bucket) AS "bucket",
        COALESCE(spend.total, 0) AS "netSpend",
        COALESCE(discount.total, 0) AS "discountTotal"
      FROM spend
      FULL OUTER JOIN discount ON discount.bucket = spend.bucket
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
