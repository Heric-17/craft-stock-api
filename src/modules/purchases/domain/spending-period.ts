/** The bucket the spending dataset is grouped by along the time dimension. */
export const SPENDING_GRANULARITIES = ['DAY', 'MONTH'] as const;

export type SpendingGranularity = (typeof SPENDING_GRANULARITIES)[number];

/**
 * The label of the bucket a purchase date falls in: `YYYY-MM-DD` for `DAY`,
 * `YYYY-MM` for `MONTH`.
 *
 * Both the Prisma adapter and the in-memory fake label their buckets with
 * this, so a test written against the fake reads the same periods the
 * database produces. UTC on purpose: the stored instant is what is bucketed,
 * and letting the label follow the server's local zone would move a purchase
 * between months depending on where the process happens to run.
 */
export function formatSpendingPeriod(date: Date, granularity: SpendingGranularity): string {
  const iso = date.toISOString();

  return granularity === 'MONTH' ? iso.slice(0, 7) : iso.slice(0, 10);
}
