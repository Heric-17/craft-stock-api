import { z } from 'zod';

export const LOG_LEVELS = ['error', 'warn', 'info', 'debug', 'verbose'] as const;

export type LogLevel = (typeof LOG_LEVELS)[number];

export const NODE_ENVS = ['development', 'test', 'production'] as const;

const POSTGRES_URL = /^postgres(ql)?:\/\/.+/;

/**
 * Which NFC-e source the installation reads from. `AUTO` picks the scraping
 * provider that matches the state the capture came from;
 * `OFFICIAL_WEBSERVICE` forces the webservice for the whole installation, and
 * is what gets switched on the day the company has a digital certificate.
 */
export const NFCE_PROVIDERS = ['AUTO', 'OFFICIAL_WEBSERVICE'] as const;

export type NfceProvider = (typeof NFCE_PROVIDERS)[number];

/**
 * Which backend Material and CompositeProduct image uploads are written to.
 * `LOCAL_DISK` for development, `S3` for production — switched for the whole
 * installation by this one variable, per StorageProviderFactory.
 */
export const STORAGE_PROVIDERS = ['LOCAL_DISK', 'S3'] as const;

export type StorageProviderKind = (typeof STORAGE_PROVIDERS)[number];

/**
 * Which channel operational alerts leave through. `CONSOLE` writes them to the
 * structured log, which is what development and the test suite want; `SMTP`
 * mails them to whoever maintains the installation. Selected for the whole
 * installation by this one variable, per NotificationSenderFactory.
 */
export const NOTIFICATION_SENDERS = ['CONSOLE', 'SMTP'] as const;

export type NotificationSenderKind = (typeof NOTIFICATION_SENDERS)[number];

export const envSchema = z
  .object({
    NODE_ENV: z.enum(NODE_ENVS).default('development'),
    PORT: z.coerce.number().int().positive().max(65535).default(3000),
    LOG_LEVEL: z.enum(LOG_LEVELS).default('info'),
    DATABASE_URL: z
      .string()
      .min(1, 'is required')
      .regex(POSTGRES_URL, 'must be a PostgreSQL connection string (postgresql://...)'),
    CORS_ORIGINS: z.string().default(''),
    PUBLIC_BASE_URL: z.string().url().optional(),
    NFCE_PROVIDER: z.enum(NFCE_PROVIDERS).default('AUTO'),
    NFCE_IMPORT_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(10).default(3),
    NFCE_IMPORT_RETRY_DELAY_MS: z.coerce.number().int().min(0).max(60_000).default(1_000),
    NFCE_CANARY_URLS: z.string().default(''),
    JWT_SECRET: z.string().min(32, 'must be at least 32 characters long'),
    JWT_EXPIRES_IN_SECONDS: z.coerce.number().int().positive().default(900),
    REFRESH_TOKEN_EXPIRES_IN_SECONDS: z.coerce
      .number()
      .int()
      .positive()
      .default(30 * 24 * 60 * 60),
    AUTH_COOKIE_SECURE: z
      .enum(['true', 'false'])
      .default('true')
      .transform((value) => value === 'true'),
    ARGON2_TIME_COST: z.coerce.number().int().min(1).max(10).default(3),
    AUDIT_LOG_RETENTION_DAYS: z.coerce.number().int().min(1).default(180),
    REQUEST_LOG_RETENTION_DAYS: z.coerce.number().int().min(1).default(30),
    STORAGE_PROVIDER: z.enum(STORAGE_PROVIDERS).default('LOCAL_DISK'),
    UPLOADS_DIR: z.string().min(1).default('./uploads'),
    // Required only when STORAGE_PROVIDER is S3 — enforced below rather than
    // with a plain default, so a missing bucket fails at startup instead of
    // on the first image upload.
    S3_BUCKET_NAME: z.string().min(1).optional(),
    S3_REGION: z.string().min(1).default('us-east-1'),
    // Public read base of the bucket, which a stored key is appended to.
    // Required when STORAGE_PROVIDER is S3, enforced below. Comes from the
    // environment rather than being assembled from bucket and region in
    // code, because the installation may well sit behind a CDN or a custom
    // domain, and a hardcoded `https://<bucket>.s3.<region>.amazonaws.com`
    // would be wrong the first time it does.
    S3_PUBLIC_BASE_URL: z.string().url().optional(),
    // Shared by both storage providers: the ceiling does not depend on the backend.
    MAX_IMAGE_UPLOAD_SIZE_BYTES: z.coerce
      .number()
      .int()
      .positive()
      .default(5 * 1024 * 1024),
    NOTIFICATION_SENDER: z.enum(NOTIFICATION_SENDERS).default('CONSOLE'),
    // How long one errorType stays quiet after an alert for it went out. An
    // error inside a loop must not turn into hundreds of messages, and the
    // count of what was suppressed rides along on the next alert. Zero
    // disables the throttle, which is only ever useful in a test.
    ERROR_ALERT_THROTTLE_SECONDS: z.coerce.number().int().min(0).default(300),
    // SMTP settings, all optional here and required below only when
    // NOTIFICATION_SENDER is SMTP: a development boot must not have to
    // configure a mail server it never talks to.
    SMTP_HOST: z.string().min(1).optional(),
    SMTP_PORT: z.coerce.number().int().positive().max(65535).default(587),
    // Spelled out as the two literals rather than coerced: `Boolean('false')`
    // is true, so coercion here would silently turn the value off by turning
    // it on.
    SMTP_SECURE: z
      .enum(['true', 'false'])
      .default('false')
      .transform((value) => value === 'true'),
    SMTP_USER: z.string().min(1).optional(),
    SMTP_PASSWORD: z.string().min(1).optional(),
    ALERT_EMAIL_FROM: z.string().email().optional(),
    // One address, or several separated by commas.
    ALERT_EMAIL_TO: z.string().min(1).optional(),
  })
  .superRefine((env, ctx) => {
    if (env.STORAGE_PROVIDER === 'S3' && !env.S3_BUCKET_NAME) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['S3_BUCKET_NAME'],
        message: 'is required when STORAGE_PROVIDER is S3',
      });
    }

    if (env.STORAGE_PROVIDER === 'S3' && !env.S3_PUBLIC_BASE_URL) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['S3_PUBLIC_BASE_URL'],
        message:
          "is required when STORAGE_PROVIDER is S3 (the bucket's public read base, e.g. https://images.empresa.com.br)",
      });
    }

    // A wildcard is refused rather than quietly dropped: someone who wrote
    // it meant to open the API to every origin, and should be told that is
    // not available here instead of discovering a silently narrower rule.
    if (
      env.CORS_ORIGINS.split(',')
        .map((origin) => origin.trim())
        .includes('*')
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['CORS_ORIGINS'],
        message:
          'must not contain "*": the API sends credentials, and a browser refuses a wildcard origin with them. List each origin explicitly.',
      });
    }

    // The three checks below are all "this must be set for a real
    // deployment". Development and the test suite have working fallbacks for
    // each, documented where the variable is declared.
    if (env.NODE_ENV === 'production') {
      if (env.CORS_ORIGINS.trim().length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['CORS_ORIGINS'],
          message:
            'is required in production: list the origins the frontend is served from, separated by commas (e.g. https://app.empresa.com.br). No browser request completes without it.',
        });
      }

      if (!env.PUBLIC_BASE_URL) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['PUBLIC_BASE_URL'],
          message:
            'is required in production: the absolute base this API is reached at (e.g. https://api.empresa.com.br). Image URLs are built from it.',
        });
      }

      if (!env.AUTH_COOKIE_SECURE) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['AUTH_COOKIE_SECURE'],
          message:
            'must not be false in production: it would send the refresh token cookie over plain HTTP.',
        });
      }
    }

    if (env.NOTIFICATION_SENDER !== 'SMTP') {
      return;
    }

    // Checked at startup rather than on the first alert: an installation that
    // discovers its alerting is misconfigured at the moment it needs to alert
    // has no alerting at all.
    for (const key of ['SMTP_HOST', 'ALERT_EMAIL_FROM', 'ALERT_EMAIL_TO'] as const) {
      if (!env[key]) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [key],
          message: 'is required when NOTIFICATION_SENDER is SMTP',
        });
      }
    }
  });

export type Env = z.infer<typeof envSchema>;

/**
 * Validates the process environment at bootstrap. Throws on the first invalid
 * configuration so the application never starts in a degraded state.
 */
export function validateEnv(raw: Record<string, unknown>): Env {
  const result = envSchema.safeParse(raw);

  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');

    throw new Error(`Invalid environment configuration:\n${details}`);
  }

  return result.data;
}
