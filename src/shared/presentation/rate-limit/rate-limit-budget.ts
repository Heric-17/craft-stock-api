import type { Env } from '../../../config/env.schema';
import type { RateLimitPolicy } from '../decorators/rate-limit.decorator';

export interface RateLimitBudget {
  /** Requests allowed per client IP and route within the window. */
  limit: number;
  windowMs: number;
}

/** `DEFAULT` is the budget of a route that named no policy. */
export type RateLimitBudgets = Record<RateLimitPolicy | 'DEFAULT', RateLimitBudget>;

type BudgetEnv = Pick<
  Env,
  | 'RATE_LIMIT_DEFAULT_LIMIT'
  | 'RATE_LIMIT_DEFAULT_WINDOW_SECONDS'
  | 'RATE_LIMIT_AUTH_LIMIT'
  | 'RATE_LIMIT_AUTH_WINDOW_SECONDS'
  | 'RATE_LIMIT_RECOVERY_LIMIT'
  | 'RATE_LIMIT_RECOVERY_WINDOW_SECONDS'
>;

export function buildRateLimitBudgets(env: BudgetEnv): RateLimitBudgets {
  return {
    DEFAULT: {
      limit: env.RATE_LIMIT_DEFAULT_LIMIT,
      windowMs: env.RATE_LIMIT_DEFAULT_WINDOW_SECONDS * 1_000,
    },
    AUTH: {
      limit: env.RATE_LIMIT_AUTH_LIMIT,
      windowMs: env.RATE_LIMIT_AUTH_WINDOW_SECONDS * 1_000,
    },
    RECOVERY: {
      limit: env.RATE_LIMIT_RECOVERY_LIMIT,
      windowMs: env.RATE_LIMIT_RECOVERY_WINDOW_SECONDS * 1_000,
    },
  };
}
