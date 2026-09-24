import { DomainError } from '../../../shared/domain/errors/domain.error';

/** Raised when a `User` is constructed with an invalid invariant. */
export class InvalidUserError extends DomainError {}

/** Raised when a use case addresses a `User` that does not exist. */
export class UserNotFoundError extends DomainError {}

/** Raised when registration is attempted with an email already in use. */
export class EmailAlreadyInUseError extends DomainError {}
