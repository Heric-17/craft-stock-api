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
      CORS_ORIGINS: '',
      NFCE_PROVIDER: 'AUTO',
      NFCE_IMPORT_MAX_ATTEMPTS: 3,
      NFCE_IMPORT_RETRY_DELAY_MS: 1_000,
      NFCE_CANARY_URLS: '',
      JWT_SECRET: VALID_JWT_SECRET,
      JWT_EXPIRES_IN_SECONDS: 900,
      REFRESH_TOKEN_EXPIRES_IN_SECONDS: 2_592_000,
      AUTH_COOKIE_SECURE: true,
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
      S3_PUBLIC_BASE_URL: 'https://images.empresa.com.br',
    });

    expect(env.STORAGE_PROVIDER).toBe('S3');
    expect(env.S3_BUCKET_NAME).toBe('craftstock-images');
  });

  /**
   * The bucket is public for reads with a fixed URL, so the base it is read
   * at is configuration, not something to assemble from bucket and region in
   * code — an installation behind a CDN or a custom domain would make any
   * assembled value wrong.
   */
  it('fails when STORAGE_PROVIDER is S3 without a public base URL', () => {
    expect(() =>
      validateEnv({
        DATABASE_URL: VALID_DATABASE_URL,
        JWT_SECRET: VALID_JWT_SECRET,
        STORAGE_PROVIDER: 'S3',
        S3_BUCKET_NAME: 'craftstock-images',
      }),
    ).toThrow(/S3_PUBLIC_BASE_URL/);
  });

  describe('the SPA edge', () => {
    const PRODUCTION = {
      DATABASE_URL: VALID_DATABASE_URL,
      JWT_SECRET: VALID_JWT_SECRET,
      NODE_ENV: 'production',
      CORS_ORIGINS: 'https://app.empresa.com.br',
      PUBLIC_BASE_URL: 'https://api.empresa.com.br',
    };

    it('accepts a fully configured production environment', () => {
      const env = validateEnv(PRODUCTION);

      expect(env.CORS_ORIGINS).toBe('https://app.empresa.com.br');
      expect(env.PUBLIC_BASE_URL).toBe('https://api.empresa.com.br');
      expect(env.AUTH_COOKIE_SECURE).toBe(true);
    });

    /**
     * Without this the API starts and every browser call fails on the
     * client side, where the cause is far from obvious. Better to refuse to
     * boot.
     */
    it('requires CORS_ORIGINS in production', () => {
      expect(() => validateEnv({ ...PRODUCTION, CORS_ORIGINS: '' })).toThrow(/CORS_ORIGINS/);
    });

    it('requires PUBLIC_BASE_URL in production, rather than defaulting to localhost', () => {
      expect(() => validateEnv({ ...PRODUCTION, PUBLIC_BASE_URL: undefined })).toThrow(
        /PUBLIC_BASE_URL/,
      );
    });

    it('refuses a non-secure session cookie in production', () => {
      expect(() => validateEnv({ ...PRODUCTION, AUTH_COOKIE_SECURE: 'false' })).toThrow(
        /AUTH_COOKIE_SECURE/,
      );
    });

    /**
     * A wildcard cannot be combined with credentials by any browser, so
     * someone who wrote one is told instead of getting a silently narrower
     * rule.
     */
    it('refuses a wildcard origin', () => {
      expect(() =>
        validateEnv({ ...PRODUCTION, CORS_ORIGINS: 'https://app.empresa.com.br,*' }),
      ).toThrow(/CORS_ORIGINS/);
    });

    it('leaves all three unset outside production, where there are fallbacks', () => {
      const env = validateEnv({
        DATABASE_URL: VALID_DATABASE_URL,
        JWT_SECRET: VALID_JWT_SECRET,
        AUTH_COOKIE_SECURE: 'false',
      });

      expect(env.CORS_ORIGINS).toBe('');
      expect(env.PUBLIC_BASE_URL).toBeUndefined();
      expect(env.AUTH_COOKIE_SECURE).toBe(false);
    });
  });
});
