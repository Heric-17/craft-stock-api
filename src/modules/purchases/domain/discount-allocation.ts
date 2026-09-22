import { Money } from '../../../shared/domain/money/money';
import type { DiscountAllocationMode } from './discount-allocation-mode';
import { DiscountAllocationError } from './purchase.error';

/** One invoice line, reduced to what the attribution needs to see. */
export interface DiscountAllocationLine {
  id: string;
  grossValue: Money;
  isCompanyExpense: boolean;
}

export interface AllocatedDiscount {
  id: string;
  allocatedDiscount: Money;
}

/** What the user typed, line by line, in `MANUAL`. */
export type ManualAllocation = ReadonlyMap<string, Money>;

/**
 * The lines a given mode is allowed to put discount on. Everything outside
 * this set must end up at exactly zero — a line holding discount while
 * sitting outside the eligible set is the dessynchronisation this whole
 * design exists to make impossible.
 */
export function eligibleLines<T extends { isCompanyExpense: boolean }>(
  lines: readonly T[],
  mode: DiscountAllocationMode,
): T[] {
  switch (mode) {
    case 'COMPANY_ONLY':
      return lines.filter((line) => line.isCompanyExpense);
    case 'PERSONAL_ONLY':
      return lines.filter((line) => !line.isCompanyExpense);
    case 'PROPORTIONAL':
    case 'MANUAL':
      return [...lines];
  }
}

/**
 * Attributes a note's discount across its lines.
 *
 * Three invariants hold whichever mode is chosen, and they are enforced here
 * rather than checked afterwards:
 *
 * - the attributed amounts add up to exactly `discountTotal`;
 * - no line takes more discount than its own `grossValue`;
 * - the rounding residue lands on the largest eligible line, where a cent
 *   weighs least.
 *
 * A note with no discount is not a mode at all: every line gets zero and the
 * user is never asked to choose.
 */
export function allocateDiscount(
  lines: readonly DiscountAllocationLine[],
  discountTotal: Money,
  mode: DiscountAllocationMode,
  manual?: ManualAllocation,
): AllocatedDiscount[] {
  if (discountTotal.isNegative()) {
    throw new DiscountAllocationError('Invoice discountTotal must not be negative.');
  }

  if (lines.length === 0) {
    if (!discountTotal.isZero()) {
      throw new DiscountAllocationError(
        'An invoice discount cannot be attributed: the purchase has no lines.',
      );
    }

    return [];
  }

  // No discount on the note: nothing to attribute, and nothing to ask.
  if (discountTotal.isZero()) {
    return lines.map((line) => ({ id: line.id, allocatedDiscount: Money.zero() }));
  }

  if (mode === 'MANUAL') {
    return allocateManually(lines, discountTotal, manual);
  }

  return allocateProportionally(lines, discountTotal, mode);
}

function allocateManually(
  lines: readonly DiscountAllocationLine[],
  discountTotal: Money,
  manual: ManualAllocation | undefined,
): AllocatedDiscount[] {
  if (manual === undefined) {
    throw new DiscountAllocationError(
      'MANUAL discount allocation requires an amount for each line.',
    );
  }

  const allocated = lines.map((line) => {
    const amount = manual.get(line.id) ?? Money.zero();

    if (amount.isNegative()) {
      throw new DiscountAllocationError(
        `Manual discount for line ${line.id} must not be negative.`,
      );
    }

    if (amount.isGreaterThan(line.grossValue)) {
      throw new DiscountAllocationError(
        `Manual discount of ${amount.toDecimalString()} for line ${line.id} exceeds the line's gross value of ${line.grossValue.toDecimalString()}.`,
      );
    }

    return { id: line.id, allocatedDiscount: amount };
  });

  const total = sumAllocations(allocated);

  // There is nothing to recompute in MANUAL: the amounts are the user's
  // input and derive from nothing, so a sum that does not close is refused
  // rather than adjusted.
  if (!total.equals(discountTotal)) {
    throw new DiscountAllocationError(
      `Manual discount allocation adds up to ${total.toDecimalString()}, which does not match the note's discountTotal of ${discountTotal.toDecimalString()}.`,
    );
  }

  return allocated;
}

function allocateProportionally(
  lines: readonly DiscountAllocationLine[],
  discountTotal: Money,
  mode: DiscountAllocationMode,
): AllocatedDiscount[] {
  const eligible = eligibleLines(lines, mode);

  if (eligible.length === 0) {
    throw new DiscountAllocationError(
      `${mode} discount allocation was chosen, but the purchase has no eligible line to carry the discount.`,
    );
  }

  const eligibleGross = eligible.reduce((total, line) => total.plus(line.grossValue), Money.zero());

  if (discountTotal.isGreaterThan(eligibleGross)) {
    throw new DiscountAllocationError(
      `A discount of ${discountTotal.toDecimalString()} cannot be attributed to lines worth ${eligibleGross.toDecimalString()}: no line may take more discount than it is worth.`,
    );
  }

  const eligibleIds = new Set(eligible.map((line) => line.id));

  // Multiply before dividing, both by integer cent counts, so the only
  // rounding in the whole attribution is the single one inside `dividedBy`.
  const allocated = lines.map((line) => ({
    id: line.id,
    allocatedDiscount: eligibleIds.has(line.id)
      ? line.grossValue.times(discountTotal.toCents()).dividedBy(eligibleGross.toCents())
      : Money.zero(),
  }));

  const residue = discountTotal.minus(sumAllocations(allocated));

  if (!residue.isZero()) {
    applyResidue(lines, allocated, residue, eligibleIds);
  }

  return allocated;
}

/**
 * The residue goes to the largest eligible line that can still absorb it
 * without going past its own gross value. Largest first because a cent
 * distorts it least, relatively; "that can absorb it" because the cap is an
 * invariant, not a preference.
 */
function applyResidue(
  lines: readonly DiscountAllocationLine[],
  allocated: AllocatedDiscount[],
  residue: Money,
  eligibleIds: ReadonlySet<string>,
): void {
  const candidates = lines
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => eligibleIds.has(line.id))
    .sort((a, b) => b.line.grossValue.toCents() - a.line.grossValue.toCents());

  for (const { line, index } of candidates) {
    const adjusted = allocated[index].allocatedDiscount.plus(residue);

    if (!adjusted.isNegative() && !adjusted.isGreaterThan(line.grossValue)) {
      allocated[index] = { id: allocated[index].id, allocatedDiscount: adjusted };
      return;
    }
  }

  throw new DiscountAllocationError(
    `The rounding residue of ${residue.toDecimalString()} could not be attributed to any eligible line without exceeding its gross value.`,
  );
}

export function sumAllocations(allocated: readonly AllocatedDiscount[]): Money {
  return allocated.reduce((total, line) => total.plus(line.allocatedDiscount), Money.zero());
}
