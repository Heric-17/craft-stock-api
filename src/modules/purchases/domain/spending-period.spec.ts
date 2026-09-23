import { formatSpendingPeriod } from './spending-period';

describe('formatSpendingPeriod', () => {
  it('labels a month bucket and a day bucket', () => {
    const date = new Date('2026-09-10T12:00:00Z');

    expect(formatSpendingPeriod(date, 'MONTH')).toBe('2026-09');
    expect(formatSpendingPeriod(date, 'DAY')).toBe('2026-09-10');
  });

  it('labels by the stored instant, not by the server clock', () => {
    // The last hour of a UTC month is still that month. Letting the label
    // follow the process's local zone would move a purchase between months
    // depending on where the process happens to run.
    expect(formatSpendingPeriod(new Date('2026-09-30T23:30:00Z'), 'MONTH')).toBe('2026-09');
    expect(formatSpendingPeriod(new Date('2026-10-01T00:30:00Z'), 'MONTH')).toBe('2026-10');
  });
});
