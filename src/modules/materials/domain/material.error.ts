import { DomainError } from '../../../shared/domain/errors/domain.error';

/** Raised when a `Material` is constructed with an invalid invariant. */
export class InvalidMaterialError extends DomainError {}

/** Raised when a use case addresses a `Material` that does not exist. */
export class MaterialNotFoundError extends DomainError {}

/** Raised when a stock entry command does not describe exactly one change. */
export class InvalidStockEntryError extends DomainError {}

/**
 * Why the unit is locked. The two cases need different wording and offer the
 * user different ways out — zero the stock, or remove the recipe lines — so
 * they are told apart in the payload instead of in the sentence.
 */
export type ConsumptionUnitLockReason = 'STOCK_ON_HAND' | 'BOM_REFERENCES';

export interface ConsumptionUnitLockedDetails {
  materialId: string;
  reason: ConsumptionUnitLockReason;
  /** The balance that would change meaning. Non-zero when the reason is `STOCK_ON_HAND`. */
  stockQuantity: number;
  /** How many recipe lines are expressed in the current unit. Non-zero when the reason is `BOM_REFERENCES`. */
  bomItemReferences: number;
}

/**
 * Raised when a `Material`'s `consumptionUnit` is changed while something is
 * already expressed in the current one — stock on hand, or a `BomItem` that
 * consumes it.
 */
export class ConsumptionUnitLockedError extends DomainError<ConsumptionUnitLockedDetails> {}
