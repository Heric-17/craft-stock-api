import type { Env } from '../../../../config/env.schema';
import type { EnvService } from '../../../../config/env.service';
import { InvalidTokenError } from '../../domain/auth.error';
import { JwtTokenProvider } from './jwt-token.provider';

function buildProvider(overrides: Partial<Env> = {}): JwtTokenProvider {
  const values: Partial<Env> = {
    JWT_SECRET: 'a-test-secret-that-is-long-enough',
    JWT_EXPIRES_IN_SECONDS: 3_600,
    ...overrides,
  };

  const env = {
    get: <K extends keyof Env>(key: K): Env[K] => values[key] as Env[K],
  } as EnvService;

  return new JwtTokenProvider(env);
}

describe('JwtTokenProvider', () => {
  it('verifies a token it just signed, recovering the same payload', () => {
    const provider = buildProvider();

    const { accessToken, expiresInSeconds } = provider.sign({
      sub: 'user-1',
      email: 'heric@craftstock.dev',
    });

    expect(expiresInSeconds).toBe(3_600);
    expect(provider.verify(accessToken)).toEqual({ sub: 'user-1', email: 'heric@craftstock.dev' });
  });

  it('rejects a token that has expired', () => {
    // A negative lifetime puts `exp` before `iat`, so the token is already
    // expired the instant it is issued — no need to wait or fake the clock.
    const provider = buildProvider({ JWT_EXPIRES_IN_SECONDS: -1 });

    const { accessToken } = provider.sign({ sub: 'user-1', email: 'heric@craftstock.dev' });

    expect(() => provider.verify(accessToken)).toThrow(InvalidTokenError);
  });

  it('rejects a token signed with a different secret', () => {
    const issuer = buildProvider({ JWT_SECRET: 'the-real-secret-value-1234567890' });
    const attacker = buildProvider({ JWT_SECRET: 'a-completely-different-secret-value' });

    const { accessToken } = issuer.sign({ sub: 'user-1', email: 'heric@craftstock.dev' });

    expect(() => attacker.verify(accessToken)).toThrow(InvalidTokenError);
  });

  it('rejects a malformed token', () => {
    const provider = buildProvider();

    expect(() => provider.verify('not-a-jwt')).toThrow(InvalidTokenError);
  });
});
