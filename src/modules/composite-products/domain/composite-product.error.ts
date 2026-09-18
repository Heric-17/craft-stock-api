import { DomainError } from '../../../shared/domain/errors/domain.error';

/** Raised when a `CompositeProduct`, `BillOfMaterials`, or `BomItem` is constructed with an invalid invariant. */
export class InvalidCompositeProductError extends DomainError {}
