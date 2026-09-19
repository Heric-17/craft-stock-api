import { DomainError } from '../../../shared/domain/errors/domain.error';

/** Raised when a `CompositeProduct`, `BillOfMaterials`, or `BomItem` is constructed with an invalid invariant. */
export class InvalidCompositeProductError extends DomainError {}

/** Raised when a use case addresses a `CompositeProduct` that does not exist. */
export class CompositeProductNotFoundError extends DomainError {}

/** Raised when a `BillOfMaterials` item references a `Material` that does not exist. */
export class UnknownMaterialReferenceError extends DomainError {}
