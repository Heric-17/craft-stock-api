import { applyMargin, MAX_MARGIN_BASIS_POINTS } from './margin';
import { Money } from './money';
import { InvalidMoneyOperationError } from './money.error';

/**
 * Reference for the property test below, in `BigInt` and written without
 * `Money`: `round(cents × (10 000 + bp) ÷ 10 000)`, half away from zero.
 */
function reference(cents: number, basisPoints: number): number {
  const numerator = BigInt(cents) * BigInt(10_000 + basisPoints);

  return Number((2n * numerator + 10_000n) / 20_000n);
}

describe('applyMargin', () => {
  it('leaves the amount alone at a margin of zero', () => {
    expect(applyMargin(Money.fromDecimalString('10.00'), 0).toDecimalString()).toBe('10.00');
  });

  it('doubles the amount at 100%', () => {
    expect(applyMargin(Money.fromDecimalString('10.00'), 10_000).toDecimalString()).toBe('20.00');
  });

  it('marks up by 33,33%, which no float holds exactly', () => {
    // 1001 ¢ × 13333 ÷ 10000 = 1334,6333 ¢.
    expect(applyMargin(Money.fromDecimalString('10.01'), 3333).toDecimalString()).toBe('13.35');
  });

  it('decides an exact half-cent by the rule, away from zero', () => {
    // 125 ¢ × 13480 ÷ 10000 is exactly 168,5 ¢; in floats it is 168,49999….
    expect(applyMargin(Money.fromCents(125), 3480).toCents()).toBe(169);
    expect(applyMargin(Money.fromCents(-125), 3480).toCents()).toBe(-169);
  });

  it('agrees with the exact integer arithmetic for every margin the column can hold', () => {
    const costs = [1, 3, 7, 25, 99, 125, 250, 490, 1001, 12_345, 99_999, 123_457];
    let compared = 0;

    for (let basisPoints = 0; basisPoints <= MAX_MARGIN_BASIS_POINTS; basisPoints++) {
      for (const cents of costs) {
        const actual = applyMargin(Money.fromCents(cents), basisPoints).toCents();
        const expected = reference(cents, basisPoints);

        if (actual !== expected) {
          throw new Error(`${cents} ¢ at ${basisPoints} bp: expected ${expected}, got ${actual}`);
        }
        compared++;
      }
    }

    expect(compared).toBe((MAX_MARGIN_BASIS_POINTS + 1) * costs.length);
  });

  it.each([-1, 33.33, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects %p, which is not a whole number of basis points',
    (basisPoints) => {
      expect(() => applyMargin(Money.fromCents(100), basisPoints)).toThrow(
        InvalidMoneyOperationError,
      );
    },
  );
});
