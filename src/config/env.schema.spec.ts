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
      AUDIT_LOG_RETENTION_DAYS: 180,
      REQUEST_LOG_RETENTION_DAYS: 30,
      STORAGE_PROVIDER: 'LOCAL_DISK',
      UPLOADS_DIR: './uploads',
      S3_REGION: 'us-east-1',
      MAX_IMAGE_UPLOAD_SIZE_BYTES: 5 * 1024 * 1024,
      NOTIFICATION_SENDER: 'CONSOLE',
      ERROR_ALERT_THROTTLE_SECONDS: 300,
      SMTP_PORT: 587,
      SMTP_SECURE: false,
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

  /**
   * Alerting that only discovers it is misconfigured at the moment it needs to
   * alert is not alerting at all — hence at startup, not on first use.
   */
  it('requires the SMTP settings only when SMTP is the selected channel', () => {
    expect(() =>
      validateEnv({
        DATABASE_URL: VALID_DATABASE_URL,
        JWT_SECRET: VALID_JWT_SECRET,
        NOTIFICATION_SENDER: 'SMTP',
      }),
    ).toThrow(/SMTP_HOST/);
  });

  it('accepts SMTP once host, sender and recipient are given', () => {
    const env = validateEnv({
      DATABASE_URL: VALID_DATABASE_URL,
      JWT_SECRET: VALID_JWT_SECRET,
      NOTIFICATION_SENDER: 'SMTP',
      SMTP_HOST: 'smtp.example.com',
      ALERT_EMAIL_FROM: 'alerts@example.com',
      ALERT_EMAIL_TO: 'dev@example.com',
    });

    expect(env.NOTIFICATION_SENDER).toBe('SMTP');
    expect(env.SMTP_PORT).toBe(587);
  });

  /** `Boolean('false')` is true, which is the whole reason this is not coerced. */
  it('reads SMTP_SECURE=false as false', () => {
    const env = validateEnv({
      DATABASE_URL: VALID_DATABASE_URL,
      JWT_SECRET: VALID_JWT_SECRET,
      SMTP_SECURE: 'false',
    });

    expect(env.SMTP_SECURE).toBe(false);
  });

  it('reads SMTP_SECURE=true as true', () => {
    const env = validateEnv({
      DATABASE_URL: VALID_DATABASE_URL,
      JWT_SECRET: VALID_JWT_SECRET,
      SMTP_SECURE: 'true',
    });

    expect(env.SMTP_SECURE).toBe(true);
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

  it('fails when STORAGE_PROVIDER is S3 without a bucket name', () => {
    expect(() =>
      validateEnv({
        DATABASE_URL: VALID_DATABASE_URL,
        JWT_SECRET: VALID_JWT_SECRET,
        STORAGE_PROVIDER: 'S3',
      }),
    ).toThrow(/S3_BUCKET_NAME/);
  });

  it('accepts STORAGE_PROVIDER S3 once a bucket name is set', () => {
    const env = validateEnv({
      DATABASE_URL: VALID_DATABASE_URL,
      JWT_SECRET: VALID_JWT_SECRET,
      STORAGE_PROVIDER: 'S3',
      S3_BUCKET_NAME: 'craftstock-images',
    });

    expect(env.STORAGE_PROVIDER).toBe('S3');
    expect(env.S3_BUCKET_NAME).toBe('craftstock-images');
  });
});
