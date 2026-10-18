import { DomainError } from '../../../shared/domain/errors/domain.error';

/**
 * Raised when a login attempt does not match an account. Deliberately the
 * same error whether the email is unknown or the password is wrong, so the
 * response never discloses which half of the pair was incorrect.
 */
export class InvalidCredentialsError extends DomainError {}

/**
 * Raised when a bearer token fails signature or expiry verification. Always
 * caught inside `JwtAuthGuard` and turned into a 401 — nothing outside the
 * guard is expected to see this.
 */
export class InvalidTokenError extends DomainError {}

/**
 * Raised when a refresh token is unknown, expired, or already revoked —
 * including a token that was already rotated away, which is what makes reuse
 * of a spent token a refusal instead of a silent second success. One error
 * for every case, same reasoning as `InvalidCredentialsError`: which case it
 * was is not the caller's to know.
 */
export class InvalidRefreshTokenError extends DomainError {}

/**
 * Raised when the current password given to change it does not match the
 * account's. Kept apart from `InvalidCredentialsError` on purpose: that one is
 * a 401, which a client reads as "your session is gone" and answers by trying
 * to refresh and then signing out. Here the session is fine and only the
 * password typed into the form is wrong.
 */
export class InvalidCurrentPasswordError extends DomainError {}

/**
 * Raised when a password reset token is unknown, expired, or already used.
 * One error for every case, same reasoning as `InvalidRefreshTokenError`:
 * which case it was is not the caller's to know.
 */
export class InvalidPasswordResetTokenError extends DomainError {}
