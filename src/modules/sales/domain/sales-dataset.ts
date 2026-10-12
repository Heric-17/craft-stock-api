import { Money } from '../../../shared/domain/money/money';
import { businessMonthOf, businessMonthsIn } from '../../../shared/domain/time/business-calendar';
import { PAYMENT_STATUSES, type PaymentStatus } from './payment-status.enum';
import type {
  OpenSalesCell,
  SalesByMonth,
  SalesByPaymentStatus,
  SalesByProductionStatus,
  SalesDataset,
  SalesDatasetQuery,
  SalesTotals,
} from './ports/sales-analytics.port';
import { PRODUCTION_STATUSES, type ProductionStatus } from './production-status.enum';

/** One sale reduced to what the dataset groups and sums. */
export interface SaleSummary {
  createdAt: Date;
  paymentStatus: PaymentStatus;
  productionStatus: ProductionStatus;
  /** From {@link saleTotal}: the sum of the lines' rounded totals. */
  totalAmount: Money;
}

/** Open means not both paid and delivered. */
export function isOpenSale(sale: Pick<SaleSummary, 'paymentStatus' | 'productionStatus'>): boolean {
  return sale.paymentStatus === 'PENDING' || sale.productionStatus !== 'DELIVERED';
}

const emptyTotals = (): SalesTotals => ({ saleCount: 0, totalAmount: Money.zero() });

function add(totals: SalesTotals, sale: SaleSummary): SalesTotals {
  return {
    saleCount: totals.saleCount + 1,
    totalAmount: totals.totalAmount.plus(sale.totalAmount),
  };
}

/**
 * Folds sales into the dataset. Pure: both adapters read their sales their own
 * way and hand them here, so there is exactly one place the arithmetic and the
 * shape of the dataset are decided.
 *
 * `periodSales` must be the sales created in `[query.from, query.to)` and
 * `openSales` every open sale regardless of date — filtering is the adapter's
 * job, because that is where it can be pushed to the database.
 */
export function buildSalesDataset(
  query: SalesDatasetQuery,
  periodSales: readonly SaleSummary[],
  openSales: readonly SaleSummary[],
): SalesDataset {
  const byMonth = new Map<string, SalesTotals>(
    businessMonthsIn(query.from, query.to).map((month) => [month, emptyTotals()]),
  );
  const byPayment = new Map<PaymentStatus, SalesTotals>(
    PAYMENT_STATUSES.map((status) => [status, emptyTotals()]),
  );
  const byProduction = new Map<ProductionStatus, SalesTotals>(
    PRODUCTION_STATUSES.map((status) => [status, emptyTotals()]),
  );

  for (const sale of periodSales) {
    const month = businessMonthOf(sale.createdAt);

    byMonth.set(month, add(byMonth.get(month) ?? emptyTotals(), sale));
    byPayment.set(sale.paymentStatus, add(byPayment.get(sale.paymentStatus) as SalesTotals, sale));
    byProduction.set(
      sale.productionStatus,
      add(byProduction.get(sale.productionStatus) as SalesTotals, sale),
    );
  }

  return {
    from: query.from,
    to: query.to,
    byMonth: [...byMonth.entries()]
      .map(([month, totals]): SalesByMonth => ({ month, ...totals }))
      .sort((a, b) => a.month.localeCompare(b.month)),
    byPaymentStatus: PAYMENT_STATUSES.map((paymentStatus): SalesByPaymentStatus => ({
      paymentStatus,
      ...(byPayment.get(paymentStatus) as SalesTotals),
    })),
    byProductionStatus: PRODUCTION_STATUSES.map((productionStatus): SalesByProductionStatus => ({
      productionStatus,
      ...(byProduction.get(productionStatus) as SalesTotals),
    })),
    openItems: buildOpenItems(openSales),
  };
}

/** Every cell of the cross of the two axes that can hold an open sale, zeros included. */
function buildOpenItems(openSales: readonly SaleSummary[]): OpenSalesCell[] {
  const cells: OpenSalesCell[] = [];

  for (const paymentStatus of PAYMENT_STATUSES) {
    for (const productionStatus of PRODUCTION_STATUSES) {
      if (!isOpenSale({ paymentStatus, productionStatus })) {
        continue;
      }

      const totals = openSales
        .filter(
          (sale) =>
            sale.paymentStatus === paymentStatus && sale.productionStatus === productionStatus,
        )
        .reduce(add, emptyTotals());

      cells.push({ paymentStatus, productionStatus, ...totals });
    }
  }

  return cells;
}
