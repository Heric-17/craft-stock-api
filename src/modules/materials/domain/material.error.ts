import { DomainError } from '../../../shared/domain/errors/domain.error';

/** Raised when a `Material` is constructed with an invalid invariant. */
export class InvalidMaterialError extends DomainError {}

/** Raised when a use case addresses a `Material` that does not exist. */
export class MaterialNotFoundError extends DomainError {}

/** Raised when a stock entry command does not describe exactly one change. */
export class InvalidStockEntryError extends DomainError {}
