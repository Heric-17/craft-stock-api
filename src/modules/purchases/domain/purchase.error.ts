import { DomainError } from '../../../shared/domain/errors/domain.error';

/** Raised when a `Purchase` or `PurchaseItem` is constructed with an invalid invariant. */
export class InvalidPurchaseError extends DomainError {}
