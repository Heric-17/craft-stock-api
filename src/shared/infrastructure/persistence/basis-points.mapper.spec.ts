import { Prisma } from '../prisma/generated/client';
import { toDomainBasisPoints, toPersistencePercentage } from './basis-points.mapper';

describe('basis points mapper', () => {
  it.each([
    ['0.00', 0],
    ['0.01', 1],
    ['33.33', 3333],
    ['34.80', 3480],
    ['35.00', 3500],
    ['100.00', 10_000],
    ['999.99', 99_999],
  ])('reads %s%% as %d basis points', (percentage, basisPoints) => {
    expect(toDomainBasisPoints(new Prisma.Decimal(percentage))).toBe(basisPoints);
  });

  it('writes basis points back as the same percentage, every value the column holds', () => {
    for (let basisPoints = 0; basisPoints <= 99_999; basisPoints++) {
      const stored = toPersistencePercentage(basisPoints);

      expect(stored.decimalPlaces()).toBeLessThanOrEqual(2);
      expect(toDomainBasisPoints(stored)).toBe(basisPoints);
    }
  });

  it('keeps the value an existing row already holds', () => {
    // A row stored as 35.00 before this change is read as 3500 after it.
    expect(toPersistencePercentage(3500).toFixed(2)).toBe('35.00');
  });

  it('refuses a stored percentage that is not a whole number of basis points', () => {
    expect(() => toDomainBasisPoints(new Prisma.Decimal('33.333'))).toThrow(RangeError);
  });
});
