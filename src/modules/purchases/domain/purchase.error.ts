import { DomainError } from '../../../shared/domain/errors/domain.error';

/** Raised when a `Purchase` or `PurchaseItem` is constructed with an invalid invariant. */
export class InvalidPurchaseError extends DomainError {}

/** Raised when an invoice line is matched to a `Material` that does not exist. */
export class UnknownMaterialReferenceError extends DomainError {}

/**
 * Which rule of §14.4 the attribution broke.
 *
 * One code and one payload shape for the whole family, discriminated by
 * `reason`, rather than a class per rule: the client reacts to all of these
 * the same way — show the screen again with the numbers that did not add up
 * — and the `reason` is what decides the sentence.
 */
export type DiscountAllocationReason =
  /** The note's own discount is negative. */
  | 'NEGATIVE_DISCOUNT_TOTAL'
  /** There is a discount but no line to carry it. */
  | 'NO_LINES'
  /** `MANUAL` was chosen without an amount per line. */
  | 'MANUAL_INPUT_MISSING'
  /** A manually entered amount is below zero. */
  | 'NEGATIVE_LINE_AMOUNT'
  /** A line was given more discount than the line is worth. */
  | 'LINE_EXCEEDS_GROSS'
  /** The attributed amounts do not add up to `discountTotal`. */
  | 'SUM_MISMATCH'
  /** The chosen mode has no eligible line — `COMPANY_ONLY` with no company line, say. */
  | 'NO_ELIGIBLE_LINE'
  /** The discount is larger than the lines it would have to come off. */
  | 'DISCOUNT_EXCEEDS_GROSS'
  /** The rounding residue fits on no eligible line without exceeding its gross value. */
  | 'RESIDUE_UNALLOCATABLE';

/**
 * Money travels as a decimal string, never a JSON number (§8.1): the whole
 * point of these two fields is that the client can show the user exactly
 * what was expected and what arrived, and a float would corrupt that on the
 * way out.
 */
export interface DiscountAllocationDetails {
  reason: DiscountAllocationReason;
  /** What the amount had to be — `discountTotal`, or a line's gross value. */
  expected?: string;
  /** What was actually attributed or entered. */
  provided?: string;
  /** The line at fault, for the per-line reasons. */
  itemId?: string;
  /** The mode in force, for the reasons that depend on the eligible set. */
  mode?: string;
}

/** Raised when the user's choice of discount attribution cannot be honoured. */
export class DiscountAllocationError extends DomainError<DiscountAllocationDetails> {}

/**
 * Raised when a line outside the current mode's eligible set is holding
 * discount. This is not a user mistake — every path that can change a
 * classification reattributes at the end of the same operation, so reaching
 * this state means a code path found a way around the aggregate root. It
 * fails loudly and is never quietly corrected.
 */
export class DiscountAllocationDesyncError extends DomainError {}

export interface PendingDiscountAllocationDetails {
  purchaseId: string;
  /** `discountTotal`, as a decimal string. */
  expected: string;
  /** What the lines currently add up to, as a decimal string. */
  provided: string;
}

/** Raised when an edit is completed while the manual attribution has not been restated. */
export class PendingDiscountAllocationError extends DomainError<PendingDiscountAllocationDetails> {}

/** Raised when a use case addresses a `Purchase` that does not exist. */
export class PurchaseNotFoundError extends DomainError {}
