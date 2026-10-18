import { SetMetadata } from '@nestjs/common';

export const RATE_LIMIT_POLICY_KEY = 'rateLimitPolicy';

/**
 * The stricter budgets a route can opt into. A route without one is on the
 * default budget, which is the generous one every authenticated route shares.
 *
 * - `AUTH`: routes where a request is an attempt at a password.
 * - `RECOVERY`: routes that send mail to an address the caller names, or spend
 *   a reset token.
 */
export type RateLimitPolicy = 'AUTH' | 'RECOVERY';

/** Puts a route on one of the stricter budgets instead of the default one. */
export const RateLimit = (policy: RateLimitPolicy) => SetMetadata(RATE_LIMIT_POLICY_KEY, policy);
