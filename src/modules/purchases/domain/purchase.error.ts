import { DomainError } from '../../../shared/domain/errors/domain.error';

/** Raised when a `Purchase` or `PurchaseItem` is constructed with an invalid invariant. */
export class InvalidPurchaseError extends DomainError {}

/** Raised when an invoice line is matched to a `Material` that does not exist. */
export class UnknownMaterialReferenceError extends DomainError {}

/** Raised when the user's choice of discount attribution cannot be honoured. */
export class DiscountAllocationError extends DomainError {}

/**
 * Raised when a line outside the current mode's eligible set is holding
 * discount. This is not a user mistake — every path that can change a
 * classification reattributes at the end of the same operation, so reaching
 * this state means a code path found a way around the aggregate root. It
 * fails loudly and is never quietly corrected.
 */
export class DiscountAllocationDesyncError extends DomainError {}

/** Raised when an edit is completed while the manual attribution has not been restated. */
export class PendingDiscountAllocationError extends DomainError {}

/** Raised when a use case addresses a `Purchase` that does not exist. */
export class PurchaseNotFoundError extends DomainError {}
