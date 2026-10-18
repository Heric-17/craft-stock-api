import { buildRateLimitBudgets } from './rate-limit-budget';

describe('buildRateLimitBudgets', () => {
  it('turns each window from seconds into milliseconds, which is what the throttler counts in', () => {
    const budgets = buildRateLimitBudgets({
      RATE_LIMIT_DEFAULT_LIMIT: 300,
      RATE_LIMIT_DEFAULT_WINDOW_SECONDS: 60,
      RATE_LIMIT_AUTH_LIMIT: 10,
      RATE_LIMIT_AUTH_WINDOW_SECONDS: 900,
      RATE_LIMIT_RECOVERY_LIMIT: 5,
      RATE_LIMIT_RECOVERY_WINDOW_SECONDS: 3_600,
    });

    expect(budgets).toEqual({
      DEFAULT: { limit: 300, windowMs: 60_000 },
      AUTH: { limit: 10, windowMs: 900_000 },
      RECOVERY: { limit: 5, windowMs: 3_600_000 },
    });
  });
});
