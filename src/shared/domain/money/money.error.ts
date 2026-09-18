import { DomainError } from '../errors/domain.error';

/**
 * Raised by `Money` itself whenever an operation would produce a value the
 * value object cannot represent: a malformed decimal string, a non-integer
 * cent amount, or a division by zero.
 */
export class InvalidMoneyOperationError extends DomainError {}
