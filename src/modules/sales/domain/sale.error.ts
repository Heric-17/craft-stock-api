import { DomainError } from '../../../shared/domain/errors/domain.error';

/** Raised when a `Sale`, `SaleItem`, or `StockMovementSnapshot` is constructed with an invalid invariant. */
export class InvalidSaleError extends DomainError {}
