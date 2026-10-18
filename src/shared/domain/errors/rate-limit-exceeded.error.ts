import { DomainError } from './domain.error';

export interface RateLimitExceededDetails {
  /**
   * Whole seconds until the caller may try again, rounded up. A duration and
   * not a timestamp so a countdown on the screen does not depend on the
   * client's clock agreeing with the server's.
   */
  retryAfterSeconds: number;
  /** The same moment as an ISO-8601 instant, for a client that prefers to show the time. */
  retryAt: string;
}

/**
 * The caller made more requests than the route allows in its window. Nothing
 * is wrong with the request itself: the same one is accepted once the wait is
 * over, which is what `details` says.
 */
export class RateLimitExceededError extends DomainError<RateLimitExceededDetails> {
  constructor(details: RateLimitExceededDetails) {
    super('Too many requests. Try again later.', details);
  }
}
