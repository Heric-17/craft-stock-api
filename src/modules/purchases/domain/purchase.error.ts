import { DomainError } from '../../../shared/domain/errors/domain.error';

/** Raised when a `Purchase` or `PurchaseItem` is constructed with an invalid invariant. */
export class InvalidPurchaseError extends DomainError {}

/** Raised when an invoice line is matched to a `Material` that does not exist. */
export class UnknownMaterialReferenceError extends DomainError {}
