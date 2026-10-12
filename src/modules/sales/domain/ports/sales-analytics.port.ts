import type { Money } from '../../../../shared/domain/money/money';
import type { PaymentStatus } from '../payment-status.enum';
import type { ProductionStatus } from '../production-status.enum';

export const SALES_ANALYTICS_PORT = Symbol('SALES_ANALYTICS_PORT');

export interface SalesDatasetQuery {
  /** Inclusive lower bound, on the instant the sale was created. */
  from: Date;
  /** Exclusive upper bound — a whole month is `[first day, first day of next)`. */
  to: Date;
}

/** What every cell of the dataset reports about its slice of sales. */
export interface SalesTotals {
  saleCount: number;
  /**
   * The sum of the sales' totals, each sale being the sum of its lines'
   * rounded totals — the same figure the detail of each sale shows.
   */
  totalAmount: Money;
}

export interface SalesByMonth extends SalesTotals {
  /** `YYYY-MM`, in the business time zone. */
  month: string;
}

export interface SalesByPaymentStatus extends SalesTotals {
  paymentStatus: PaymentStatus;
}

export interface SalesByProductionStatus extends SalesTotals {
  productionStatus: ProductionStatus;
}

/** One cell of the sales still open, whatever the date they were made. */
export interface OpenSalesCell extends SalesTotals {
  paymentStatus: PaymentStatus;
  productionStatus: ProductionStatus;
}

/**
 * Sales aggregated by dimension, not a finished screen.
 *
 * Sales this month, the change against the month before, orders in production
 * and the amount still to be received are all folds over these cells, done
 * client-side.
 *
 * `byMonth`, `byPaymentStatus` and `byProductionStatus` cover the sales
 * created in `[from, to)`. Every month of the range and every value of both
 * status axes is present, a slice with no sales reporting zeros: "nothing
 * sold" is a result, and the comparison against the previous month needs it.
 *
 * `openItems` is NOT filtered by period, on purpose. A pending sale has no
 * date it stops being pending on: an order from last year that was never paid
 * is still owed. It is the cross of the two status axes over every sale that
 * is not both paid and delivered — payment pending or not yet delivered — and
 * it is bounded by how many orders are open, not by how much history there is.
 */
export interface SalesDataset {
  from: Date;
  to: Date;
  byMonth: SalesByMonth[];
  byPaymentStatus: SalesByPaymentStatus[];
  byProductionStatus: SalesByProductionStatus[];
  openItems: OpenSalesCell[];
}

/**
 * Reading side of sales. Separate from `SaleRepository` because it answers
 * questions about a period, not about an aggregate. One method, on purpose: a
 * second would be the first step back towards a method per metric.
 */
export interface SalesAnalyticsPort {
  salesDataset(query: SalesDatasetQuery): Promise<SalesDataset>;
}
