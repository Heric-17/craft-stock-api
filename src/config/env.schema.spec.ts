import { validateEnv } from './env.schema';

const VALID_DATABASE_URL = 'postgresql://craftstock:craftstock@localhost:5432/craftstock';
const VALID_JWT_SECRET = 'a'.repeat(32);

describe('validateEnv', () => {
  it('applies defaults when optional variables are absent', () => {
    const env = validateEnv({ DATABASE_URL: VALID_DATABASE_URL, JWT_SECRET: VALID_JWT_SECRET });

    expect(env).toEqual({
      NODE_ENV: 'development',
      PORT: 3000,
      LOG_LEVEL: 'info',
      DATABASE_URL: VALID_DATABASE_URL,
      NFCE_PROVIDER: 'AUTO',
      NFCE_IMPORT_MAX_ATTEMPTS: 3,
      NFCE_IMPORT_RETRY_DELAY_MS: 1_000,
      JWT_SECRET: VALID_JWT_SECRET,
      JWT_EXPIRES_IN_SECONDS: 900,
      REFRESH_TOKEN_EXPIRES_IN_SECONDS: 2_592_000,
      ARGON2_TIME_COST: 3,
    });
  });

  it('coerces PORT to a number', () => {
    const env = validateEnv({
      DATABASE_URL: VALID_DATABASE_URL,
      JWT_SECRET: VALID_JWT_SECRET,
      PORT: '8080',
    });

    expect(env.PORT).toBe(8080);
  });

  it('fails when a required variable is missing', () => {
    expect(() => validateEnv({})).toThrow(/DATABASE_URL/);
  });

  it('fails when JWT_SECRET is shorter than 32 characters', () => {
    expect(() =>
      validateEnv({ DATABASE_URL: VALID_DATABASE_URL, JWT_SECRET: 'too-short' }),
    ).toThrow(/JWT_SECRET/);
  });

  it('fails when DATABASE_URL is not a PostgreSQL connection string', () => {
    expect(() => validateEnv({ DATABASE_URL: 'mysql://localhost:3306/craftstock' })).toThrow(
      /PostgreSQL/,
    );
  });

  it('fails when PORT is not a valid port number', () => {
    expect(() =>
      validateEnv({
        DATABASE_URL: VALID_DATABASE_URL,
        JWT_SECRET: VALID_JWT_SECRET,
        PORT: '99999',
      }),
    ).toThrow(/PORT/);
  });

  it('fails when NODE_ENV is outside the allowed set', () => {
    expect(() =>
      validateEnv({
        DATABASE_URL: VALID_DATABASE_URL,
        JWT_SECRET: VALID_JWT_SECRET,
        NODE_ENV: 'staging',
      }),
    ).toThrow(/NODE_ENV/);
  });
});
