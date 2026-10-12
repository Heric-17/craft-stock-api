import { InvalidMoneyOperationError } from './money.error';
import type { Money } from './money';

/** A margin of 100% is 10 000 basis points. */
const BASIS_POINTS_PER_UNIT = 10_000;

/**
 * Largest margin a `CompositeProduct` can store: `Decimal(5,2)` holds up to
 * 999,99%, which is 99 999 basis points. Above that is a typing mistake, not a
 * markup anyone sells at, and the column could not hold it anyway.
 */
export const MAX_MARGIN_BASIS_POINTS = 99_999;

/**
 * `amount × (10 000 + marginBasisPoints) ÷ 10 000`, rounded once.
 *
 * A margin is an integer count of basis points — 33,33% is `3333`, 100% is
 * `10000` — and never a percentage held as a float. That is a representation
 * for transport and calculation only: the screen still shows and accepts
 * "33,33%". The integer is what lets a client reproduce this figure to the
 * cent, since `1 + 33.33 / 100` is not exactly representable and a float
 * multiplication can land a hair under a half-cent tie that the exact value
 * sits on (125 ¢ at 34,80% is exactly 168,5 ¢, and rounds to 169 ¢).
 *
 * The factor is `(10 000 + marginBasisPoints)` over `10 000`, so the whole
 * markup is one multiplication followed by one division, in `Money.scaled`:
 * the multiplication happens first and the rounding happens last, once, half
 * away from zero. Marking up and then adding, or marking up per line and then
 * summing, would round more than once and drift by cents.
 */
export function applyMargin(amount: Money, marginBasisPoints: number): Money {
  if (!Number.isInteger(marginBasisPoints) || marginBasisPoints < 0) {
    throw new InvalidMoneyOperationError(
      `A margin is a whole number of basis points greater than or equal to zero, received ${marginBasisPoints}.`,
    );
  }

  return amount.scaled(BASIS_POINTS_PER_UNIT + marginBasisPoints, BASIS_POINTS_PER_UNIT);
}
