import { DomainError } from '../../../shared/domain/errors/domain.error';

/** Raised when a `Sale`, `SaleItem`, or `StockMovementSnapshot` is constructed with an invalid invariant. */
export class InvalidSaleError extends DomainError {}

/** Raised when a use case addresses a `Sale` that does not exist. */
export class SaleNotFoundError extends DomainError {}

/** Raised when a use case addresses a `SaleItem` that does not exist on the given `Sale`. */
export class SaleItemNotFoundError extends DomainError {}

/** Raised when creating a `Sale` with no items — there is nothing to sell. */
export class EmptySaleError extends DomainError {}

/**
 * Raised when a `Sale` is edited (details, items) while `productionStatus`
 * is not `PENDING`. Once assembly has started, the recorded stock debit
 * reflects a specific set of items — editing them afterwards would silently
 * desync the `StockMovementSnapshot` from what was actually sold.
 */
export class SaleNotEditableError extends DomainError {}

/** Raised when a `SaleItem` references a `CompositeProduct` that does not exist. */
export class UnknownCompositeProductReferenceError extends DomainError {}

/** Raised when a `SaleItem` references a `Material` that does not exist. */
export class UnknownMaterialReferenceError extends DomainError {}

/** Raised when a `SaleItem` references a `CompositeProduct` that is discontinued — see CLAUDE.md section 9. */
export class DiscontinuedCompositeProductReferenceError extends DomainError {}

/** Raised when a `SaleItem` references a `Material` that is discontinued — see CLAUDE.md section 9. */
export class DiscontinuedMaterialReferenceError extends DomainError {}
