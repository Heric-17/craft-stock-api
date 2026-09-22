import { validateEnv } from './env.schema';

const VALID_DATABASE_URL = 'postgresql://craftstock:craftstock@localhost:5432/craftstock';

describe('validateEnv', () => {
  it('applies defaults when optional variables are absent', () => {
    const env = validateEnv({ DATABASE_URL: VALID_DATABASE_URL });

    expect(env).toEqual({
      NODE_ENV: 'development',
      PORT: 3000,
      LOG_LEVEL: 'info',
      DATABASE_URL: VALID_DATABASE_URL,
      NFCE_PROVIDER: 'AUTO',
      NFCE_IMPORT_MAX_ATTEMPTS: 3,
      NFCE_IMPORT_RETRY_DELAY_MS: 1_000,
    });
  });

  it('coerces PORT to a number', () => {
    const env = validateEnv({ DATABASE_URL: VALID_DATABASE_URL, PORT: '8080' });

    expect(env.PORT).toBe(8080);
  });

  it('fails when a required variable is missing', () => {
    expect(() => validateEnv({})).toThrow(/DATABASE_URL/);
  });

  it('fails when DATABASE_URL is not a PostgreSQL connection string', () => {
    expect(() => validateEnv({ DATABASE_URL: 'mysql://localhost:3306/craftstock' })).toThrow(
      /PostgreSQL/,
    );
  });

  it('fails when PORT is not a valid port number', () => {
    expect(() => validateEnv({ DATABASE_URL: VALID_DATABASE_URL, PORT: '99999' })).toThrow(/PORT/);
  });

  it('fails when NODE_ENV is outside the allowed set', () => {
    expect(() => validateEnv({ DATABASE_URL: VALID_DATABASE_URL, NODE_ENV: 'staging' })).toThrow(
      /NODE_ENV/,
    );
  });
});
