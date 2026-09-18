import { DomainError } from '../../../shared/domain/errors/domain.error';

/** Raised when a `User` is constructed with an invalid invariant. */
export class InvalidUserError extends DomainError {}
