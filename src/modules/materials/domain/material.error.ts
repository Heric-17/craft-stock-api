import { DomainError } from '../../../shared/domain/errors/domain.error';

/** Raised when a `Material` is constructed with an invalid invariant. */
export class InvalidMaterialError extends DomainError {}
