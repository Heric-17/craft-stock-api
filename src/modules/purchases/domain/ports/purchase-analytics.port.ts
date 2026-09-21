import type { Money } from '../../../../shared/domain/money/money';

export const PURCHASE_ANALYTICS_PORT = Symbol('PURCHASE_ANALYTICS_PORT');

/** The bucket the spending dataset is grouped by. */
export const SPENDING_GRANULARITIES = ['DAY', 'MONTH'] as const;

export type SpendingGranularity = (typeof SPENDING_GRANULARITIES)[number];

export interface SpendingByPeriodQuery {
  /** Inclusive lower bound. */
  from: Date;
  /** Exclusive upper bound — a whole month is `[first day, first day of next)`. */
  to: Date;
  granularity: SpendingGranularity;
}

/**
 * One bucket of the spending dataset. A dataset by dimension, not a finished
 * metric: totals, averages and comparisons between periods are the client's
 * to derive, so a new question on the panel does not become a new port.
 */
export interface SpendingByPeriod {
  /** `YYYY-MM-DD` for `DAY`, `YYYY-MM` for `MONTH`. */
  period: string;
  /**
   * What the company actually spent in the period: the sum of the net value
   * of every company-expense line. Never the gross side — the gap between
   * the two is exactly the discount, and it belongs in `discountTotal`.
   */
  netSpend: Money;
  /**
   * Discount obtained in the period, summed from the notes' headers. Shown
   * to the user as the month's savings.
   */
  discountTotal: Money;
}

/**
 * Reading side of purchases. Separate from `PurchaseRepository` because it
 * answers questions about a period, not about an aggregate — keeping it here
 * is what stops the repository from growing a reporting method per screen.
 */
export interface PurchaseAnalyticsPort {
  spendingByPeriod(query: SpendingByPeriodQuery): Promise<SpendingByPeriod[]>;
}
