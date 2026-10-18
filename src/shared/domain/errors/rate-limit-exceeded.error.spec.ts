import { RateLimitExceededError } from './rate-limit-exceeded.error';

describe('RateLimitExceededError', () => {
  it('publishes the stable code and carries the wait as data', () => {
    const error = new RateLimitExceededError({
      retryAfterSeconds: 42,
      retryAt: '2026-01-01T12:00:42.000Z',
    });

    expect(error.code).toBe('RATE_LIMIT_EXCEEDED');
    expect(error.details).toEqual({ retryAfterSeconds: 42, retryAt: '2026-01-01T12:00:42.000Z' });
  });
});
