import { DomainError } from '../../../shared/domain/errors/domain.error';

/** Raised when a `Material` is constructed with an invalid invariant. */
export class InvalidMaterialError extends DomainError {}

/** Raised when a use case addresses a `Material` that does not exist. */
export class MaterialNotFoundError extends DomainError {}

/** Raised when a stock entry command does not describe exactly one change. */
export class InvalidStockEntryError extends DomainError {}

/**
 * Raised when a `Material`'s `consumptionUnit` is changed while something is
 * already expressed in the current one — stock on hand, or a `BomItem` that
 * consumes it.
 */
export class ConsumptionUnitLockedError extends DomainError {}
