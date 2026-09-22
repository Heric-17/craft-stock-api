import { InvalidMoneyOperationError } from './money.error';
import type { Money } from './money';

const DISPLAY_PLACES = 4;
/** Hundredths of a cent — the fourth decimal place of a real. */
const SUB_CENT_SCALE = 100;

/**
 * `amount ÷ divisor` as a decimal string carrying four places, which is
 * enough to read a fraction of a cent: `0.0280` per gram rather than `0.03`.
 *
 * **For display only.** A `Money` holds whole cents, so any per-unit figure
 * derived from a package — the cost of a gram of flour, the price of a
 * centimetre of ribbon — cannot be represented as one without rounding away
 * most of its value. Returning a string is what keeps that figure out of
 * arithmetic: there is nothing here to multiply. Callers that need an actual
 * amount of money use `Money.scaled`, which keeps the fraction of a cent
 * alive until there is a real total to round.
 *
 * Computed on integer cents rather than through a float, for the same reason
 * `Money` exists at all. Four places is a display decision and nothing else.
 */
export function formatFractionalAmount(amount: Money, divisor: number): string {
  if (!Number.isFinite(divisor) || divisor === 0) {
    throw new InvalidMoneyOperationError(
      `formatFractionalAmount requires a finite, non-zero divisor, received ${divisor}.`,
    );
  }

  const scaled = Math.round((amount.toCents() * SUB_CENT_SCALE) / divisor);
  const sign = scaled < 0 ? '-' : '';
  const absolute = Math.abs(scaled);
  const unitScale = 10 ** DISPLAY_PLACES;
  const units = Math.trunc(absolute / unitScale);
  const fraction = String(absolute % unitScale).padStart(DISPLAY_PLACES, '0');

  return `${sign}${units}.${fraction}`;
}
