import { formatSpendingPeriod } from './spending-period';

describe('formatSpendingPeriod', () => {
  it('labels a month bucket and a day bucket', () => {
    const date = new Date('2026-09-10T12:00:00Z');

    expect(formatSpendingPeriod(date, 'MONTH')).toBe('2026-09');
    expect(formatSpendingPeriod(date, 'DAY')).toBe('2026-09-10');
  });

  it('labels by the business calendar, not by UTC and not by the server clock', () => {
    // 21:30 on 30 September in Porto Alegre is already 1 October in UTC. The
    // purchase screen shows 30/09, so the month total must include it.
    expect(formatSpendingPeriod(new Date('2026-10-01T00:30:00Z'), 'MONTH')).toBe('2026-09');
    expect(formatSpendingPeriod(new Date('2026-10-01T00:30:00Z'), 'DAY')).toBe('2026-09-30');
    expect(formatSpendingPeriod(new Date('2026-10-01T03:00:00Z'), 'MONTH')).toBe('2026-10');
  });
});
