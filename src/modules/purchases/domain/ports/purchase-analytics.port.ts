import type { Money } from '../../../../shared/domain/money/money';
import type { SpendingGranularity } from '../spending-period';

export const PURCHASE_ANALYTICS_PORT = Symbol('PURCHASE_ANALYTICS_PORT');

export interface SpendingDatasetQuery {
  /** Inclusive lower bound. */
  from: Date;
  /** Exclusive upper bound — a whole month is `[first day, first day of next)`. */
  to: Date;
  granularity: SpendingGranularity;
  /**
   * Narrows every dimension of the dataset to one shop, keyed by the same
   * `establishmentId` the dataset itself reports back.
   */
  establishmentId?: string;
}

/** What every dimension of the dataset reports about its slice. */
export interface SpendingTotals {
  /**
   * What the company actually spent: the sum of the net value of every
   * company-expense line, where net is `grossValue − allocatedDiscount`.
   *
   * Never the gross side. The gap between the two is exactly the discount,
   * and it is reported separately, in `discountTotal` — the panel answers
   * what left the till, while the gross side answers what restocking costs
   * and feeds pricing instead.
   */
  netSpend: Money;
  /**
   * The saving obtained on company lines, and deliberately not the notes'
   * own header `discountTotal`: a note mixes company and personal lines, and
   * counting the whole header discount would credit the business with a
   * saving made on a personal item. A slice with no discount reports zero,
   * which is a result and not a missing figure.
   */
  discountTotal: Money;
  /**
   * How many purchases contributed to this slice — those with at least one
   * company-expense line. It is here so the client can divide `netSpend` by
   * it for the average ticket instead of the backend growing an endpoint
   * that does the division.
   */
  purchaseCount: number;
}

export interface SpendingByPeriod extends SpendingTotals {
  /** `YYYY-MM-DD` for `DAY`, `YYYY-MM` for `MONTH`. */
  period: string;
}

export interface SpendingByEstablishment extends SpendingTotals {
  /** Null for purchases recorded without an establishment. */
  establishmentId: string | null;
  establishmentName: string | null;
}

/**
 * Spending aggregated by dimension, not a finished screen.
 *
 * Every figure the panel shows — the period total, the average ticket, the
 * ranking of shops, the month-on-month curve — is a fold over these buckets,
 * done client-side. That is the point: the dashboard is the part of the
 * system that changes most often, and a metric per endpoint would make each
 * new question the user asks travel through port, adapter, mapper and fake
 * before it could be answered.
 *
 * Purchases whose `MANUAL` attribution is still pending are left out of
 * every dimension, so no period is ever computed with part of a discount
 * attributed and part of it not.
 */
export interface SpendingDataset {
  from: Date;
  to: Date;
  granularity: SpendingGranularity;
  byPeriod: SpendingByPeriod[];
  byEstablishment: SpendingByEstablishment[];
}

/**
 * Reading side of purchases. Separate from `PurchaseRepository` because it
 * answers questions about a period, not about an aggregate — keeping it here
 * is what stops the repository from growing a reporting method per screen.
 *
 * One method, on purpose. A second one would be the first step back towards
 * a method per metric.
 */
export interface PurchaseAnalyticsPort {
  spendingDataset(query: SpendingDatasetQuery): Promise<SpendingDataset>;
}
