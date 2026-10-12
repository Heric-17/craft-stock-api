import { Inject, Injectable } from '@nestjs/common';

import { toDomainMoney } from '../../../../shared/infrastructure/persistence/money.mapper';
import type { Prisma } from '../../../../shared/infrastructure/prisma/generated/client';
import { PRISMA_CLIENT } from '../../../../shared/infrastructure/prisma/prisma-client.token';
import type {
  SalesAnalyticsPort,
  SalesDataset,
  SalesDatasetQuery,
} from '../../domain/ports/sales-analytics.port';
import { saleTotal } from '../../domain/sale-line-total';
import { buildSalesDataset, type SaleSummary } from '../../domain/sales-dataset';

/** The columns a sale's total and its cut by status and date are made from. */
const SALE_SUMMARY_SELECT = {
  createdAt: true,
  paymentStatus: true,
  productionStatus: true,
  items: { select: { quantity: true, priceBasisAmount: true, priceBasisQuantity: true } },
} as const;

type SaleSummaryRow = Prisma.SaleGetPayload<{ select: typeof SALE_SUMMARY_SELECT }>;

/** The one place a row becomes a domain figure: decimals in, `Money` and numbers out. */
function toSaleSummary(row: SaleSummaryRow): SaleSummary {
  return {
    createdAt: row.createdAt,
    paymentStatus: row.paymentStatus,
    productionStatus: row.productionStatus,
    totalAmount: saleTotal(
      row.items.map((item) => ({
        priceBasisAmount: toDomainMoney(item.priceBasisAmount),
        quantity: item.quantity.toNumber(),
        priceBasisQuantity: item.priceBasisQuantity.toNumber(),
      })),
    ),
  };
}

@Injectable()
export class PrismaSalesAnalyticsAdapter implements SalesAnalyticsPort {
  constructor(@Inject(PRISMA_CLIENT) private readonly prisma: Prisma.TransactionClient) {}

  /**
   * The sales dataset, with every amount computed in the domain.
   *
   * The database is asked only to filter — the period for the dimensions, and
   * "not both paid and delivered" for the open items — and to hand back the
   * lines of those sales. It is deliberately NOT asked to add anything up. A
   * `SUM` over the decimal columns would be one rounding at the end, while the
   * total of a sale is the sum of its lines' totals, each rounded to the cent
   * (`priceBasisAmount × quantity ÷ priceBasisQuantity`, multiplied before
   * divided): the two differ whenever a line's fraction of a cent does not
   * cancel, and the dataset would stop agreeing with the detail of the sale.
   * Reproducing that rounding in SQL would be a second implementation of it,
   * which can drift from the first on a half-cent tie. So the rows come back
   * and `saleTotal` — the same function the detail screen uses — does the sum.
   *
   * The cost is proportional to the lines read: the period bounds the first
   * query and the number of open orders bounds the second, so it does not grow
   * with the whole history.
   */
  async salesDataset(query: SalesDatasetQuery): Promise<SalesDataset> {
    const [periodRows, openRows] = await Promise.all([
      this.prisma.sale.findMany({
        where: { createdAt: { gte: query.from, lt: query.to } },
        select: SALE_SUMMARY_SELECT,
      }),
      this.prisma.sale.findMany({
        where: { OR: [{ paymentStatus: 'PENDING' }, { productionStatus: { not: 'DELIVERED' } }] },
        select: SALE_SUMMARY_SELECT,
      }),
    ]);

    return buildSalesDataset(query, periodRows.map(toSaleSummary), openRows.map(toSaleSummary));
  }
}
