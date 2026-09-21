import { Money } from '../../../shared/domain/money/money';
import { InvalidPurchaseError } from './purchase.error';

/** One invoice line, reduced to what the apportioning requires. */
export interface DiscountAllocationLine {
  /** The caller's identifier for the line, echoed back on the result. */
  id: string;
  grossValue: Money;
}

export interface AllocatedNetValue {
  id: string;
  netValue: Money;
}

/**
 * Spreads a note's discount over its lines, proportionally to each line's
 * gross value: `net(line) = round(grossValue × netTotal / grossTotal)`.
 *
 * Rounding each line independently leaves a residue of a few cents against
 * `netTotal`. The residue is thrown at the largest line, so the apportioned
 * values always add up to exactly what was paid — a spending panel that sums
 * them can never drift from the note's own total. The largest line absorbs it
 * because a cent weighs least there, relatively.
 *
 * A note with no discount is not a special case of the formula but an early
 * exit: the factor is 1 and every line keeps its gross value untouched, so no
 * rounding happens at all.
 *
 * Callers pass every line of the note — `grossTotal` is the sum of all of
 * them, and the residue is only correct against a complete set.
 */
export function allocateNetValues(
  lines: readonly DiscountAllocationLine[],
  grossTotal: Money,
  netTotal: Money,
): AllocatedNetValue[] {
  if (netTotal.isNegative() || grossTotal.isNegative()) {
    throw new InvalidPurchaseError('Invoice totals must not be negative.');
  }

  if (netTotal.isGreaterThan(grossTotal)) {
    throw new InvalidPurchaseError(
      'Invoice netTotal must not exceed grossTotal: a discount never raises what was paid.',
    );
  }

  if (lines.length === 0) {
    return [];
  }

  // Nothing to apportion: the note has no discount, or it has no value to
  // spread the discount over (a fully free note — every line is a giveaway).
  if (netTotal.equals(grossTotal) || grossTotal.isZero()) {
    return lines.map((line) => ({ id: line.id, netValue: line.grossValue }));
  }

  // Multiply before dividing, both by integer cent counts, so the only
  // rounding in the apportioning is the single one inside `dividedBy`.
  const allocated = lines.map((line) => ({
    id: line.id,
    netValue: line.grossValue.times(netTotal.toCents()).dividedBy(grossTotal.toCents()),
  }));

  const residue = netTotal.minus(
    allocated.reduce((total, line) => total.plus(line.netValue), Money.zero()),
  );

  if (!residue.isZero()) {
    const largest = indexOfLargestLine(lines);
    allocated[largest] = {
      id: allocated[largest].id,
      netValue: allocated[largest].netValue.plus(residue),
    };
  }

  return allocated;
}

/** First line of the greatest gross value — ties resolve to the earlier line. */
function indexOfLargestLine(lines: readonly DiscountAllocationLine[]): number {
  let largest = 0;

  for (let index = 1; index < lines.length; index += 1) {
    if (lines[index].grossValue.isGreaterThan(lines[largest].grossValue)) {
      largest = index;
    }
  }

  return largest;
}
