import { businessDayOf, businessMonthOf, businessMonthsIn } from './business-calendar';

describe('business calendar (America/Sao_Paulo)', () => {
  it('keeps a 21:30 sale on 31 January in January, although it is 1 February in UTC', () => {
    const sale = new Date('2026-02-01T00:30:00Z');

    expect(sale.toISOString().slice(0, 7)).toBe('2026-02');
    expect(businessMonthOf(sale)).toBe('2026-01');
    expect(businessDayOf(sale)).toBe('2026-01-31');
  });

  it('puts the first instant of a local month in that month', () => {
    expect(businessMonthOf(new Date('2026-02-01T03:00:00Z'))).toBe('2026-02');
    expect(businessMonthOf(new Date('2026-02-01T02:59:59.999Z'))).toBe('2026-01');
  });

  it('lists every month a range touches, including empty ones', () => {
    expect(
      businessMonthsIn(new Date('2026-01-01T03:00:00Z'), new Date('2026-04-01T03:00:00Z')),
    ).toEqual(['2026-01', '2026-02', '2026-03']);
  });

  it('crosses a year boundary', () => {
    expect(
      businessMonthsIn(new Date('2025-11-01T03:00:00Z'), new Date('2026-02-01T03:00:00Z')),
    ).toEqual(['2025-11', '2025-12', '2026-01']);
  });

  it('treats the upper bound as exclusive', () => {
    expect(
      businessMonthsIn(new Date('2026-01-01T03:00:00Z'), new Date('2026-02-01T03:00:00Z')),
    ).toEqual(['2026-01']);
  });

  it('is empty for an empty or inverted range', () => {
    const instant = new Date('2026-01-10T12:00:00Z');

    expect(businessMonthsIn(instant, instant)).toEqual([]);
    expect(businessMonthsIn(new Date('2026-02-01T00:00:00Z'), instant)).toEqual([]);
  });
});
