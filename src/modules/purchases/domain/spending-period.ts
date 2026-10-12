import { businessDayOf, businessMonthOf } from '../../../shared/domain/time/business-calendar';

/** The bucket the spending dataset is grouped by along the time dimension. */
export const SPENDING_GRANULARITIES = ['DAY', 'MONTH'] as const;

export type SpendingGranularity = (typeof SPENDING_GRANULARITIES)[number];

/**
 * The label of the bucket a purchase date falls in: `YYYY-MM-DD` for `DAY`,
 * `YYYY-MM` for `MONTH`.
 *
 * Both the Prisma adapter and the in-memory fake label their buckets with
 * this, so a test written against the fake reads the same periods the
 * database produces. The label is the day or month in the business time zone
 * (`America/Sao_Paulo`), because that is the date the screen shows for the
 * purchase: bucketing by UTC would drop a purchase made on the evening of the
 * last day of a month into the next one.
 */
export function formatSpendingPeriod(date: Date, granularity: SpendingGranularity): string {
  return granularity === 'MONTH' ? businessMonthOf(date) : businessDayOf(date);
}
