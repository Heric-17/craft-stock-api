import { z } from 'zod';

import { parseTrustProxy, type TrustProxy } from './trust-proxy';

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

/**
 * Which channel mail to a person (the password reset link) leaves through.
 * `CONSOLE` only records that a message would have gone out; `SMTP` sends it.
 * Separate from `NOTIFICATION_SENDER` because the two answer different
 * questions — who maintains the installation versus who is asking — but they
 * share the one set of `SMTP_*` connection settings.
 */
export const EMAIL_SENDERS = ['CONSOLE', 'SMTP'] as const;

export type EmailSenderKind = (typeof EMAIL_SENDERS)[number];

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
    EMAIL_SENDER: z.enum(EMAIL_SENDERS).default('CONSOLE'),
    // The From address of mail sent to people. Required when EMAIL_SENDER is SMTP.
    EMAIL_FROM: z.string().email().optional(),
    // Where the web app is served, which the link in a password reset e-mail
    // points at. Required in production when EMAIL_SENDER is SMTP: a default
    // would let an installation mail out links to the loopback address, and
    // nobody would find out until someone needed one. An installation used only
    // as an API, with no mail configured, does not need it.
    WEB_APP_URL: z.string().url().optional(),
    // Which entries of `X-Forwarded-For` are our own proxies and which is the
    // client, which is what decides the address rate limiting counts a client
    // under. A count of proxies (`1`) or a list of known ones
    // (`loopback,uniquelocal,cloudflare`); see `parseTrustProxy`. Never a
    // boolean: `true` would trust the header's leftmost entry, which the client
    // writes itself, and anyone could pick the address they are counted under.
    // Empty is "not set", not zero, so the production check below has
    // something to check.
    TRUST_PROXY: z
      .string()
      .optional()
      .transform((value, ctx): TrustProxy | undefined => {
        if (value === undefined || value.trim() === '') {
          return undefined;
        }

        const parsed = parseTrustProxy(value);

        if (!parsed.ok) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: parsed.message });
          return z.NEVER;
        }

        return parsed.value;
      }),
    // Rate limiting, one budget per kind of route: at most LIMIT requests per
    // client IP and route in a window of WINDOW_SECONDS. DEFAULT covers every
    // route not named below; AUTH covers password attempts; RECOVERY covers
    // the routes that send mail or spend a reset token.
    RATE_LIMIT_DEFAULT_LIMIT: z.coerce.number().int().min(1).default(300),
    RATE_LIMIT_DEFAULT_WINDOW_SECONDS: z.coerce.number().int().min(1).default(60),
    RATE_LIMIT_AUTH_LIMIT: z.coerce.number().int().min(1).default(10),
    RATE_LIMIT_AUTH_WINDOW_SECONDS: z.coerce
      .number()
      .int()
      .min(1)
      .default(15 * 60),
    RATE_LIMIT_RECOVERY_LIMIT: z.coerce.number().int().min(1).default(5),
    RATE_LIMIT_RECOVERY_WINDOW_SECONDS: z.coerce
      .number()
      .int()
      .min(1)
      .default(60 * 60),
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

    // No default in production because either guess fails silently. Assuming
    // no proxy behind one makes every client share the proxy's address, so the
    // limit locks everybody out together after a handful of requests; assuming
    // a proxy without one lets a client name its own address in a header and
    // never reach the limit. Zero is a valid answer: "exposed directly".
    if (env.NODE_ENV === 'production' && env.TRUST_PROXY === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['TRUST_PROXY'],
        message:
          'is required in production: how to tell the proxies in front of the API from the client, either their number (1 for a single proxy, 0 when the API is reached directly) or a list of known ones (e.g. loopback,uniquelocal,cloudflare). It decides which address the rate limit counts a client under.',
      });
    }

    // Only mail that is actually delivered carries the link, so only then does
    // a missing base matter: it would send people a link to the loopback
    // address. With CONSOLE nothing leaves the machine.
    if (env.NODE_ENV === 'production' && env.EMAIL_SENDER === 'SMTP' && !env.WEB_APP_URL) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['WEB_APP_URL'],
        message:
          'is required in production when EMAIL_SENDER is SMTP: the absolute base the web app is served at (e.g. https://app.empresa.com.br). The password reset link is built from it.',
      });
    }

    // Checked at startup rather than on the first alert: an installation that
    // discovers its alerting is misconfigured at the moment it needs to alert
    // has no alerting at all. Same for the reset e-mail, which is needed
    // exactly when someone is locked out.
    type RequiredKey = 'SMTP_HOST' | 'ALERT_EMAIL_FROM' | 'ALERT_EMAIL_TO' | 'EMAIL_FROM';
    const smtpRequirements: { when: boolean; selector: string; keys: RequiredKey[] }[] = [
      {
        when: env.NOTIFICATION_SENDER === 'SMTP',
        selector: 'NOTIFICATION_SENDER',
        keys: ['SMTP_HOST', 'ALERT_EMAIL_FROM', 'ALERT_EMAIL_TO'],
      },
      {
        when: env.EMAIL_SENDER === 'SMTP',
        selector: 'EMAIL_SENDER',
        keys: ['SMTP_HOST', 'EMAIL_FROM'],
      },
    ];

    for (const { when, selector, keys } of smtpRequirements) {
      if (!when) {
        continue;
      }

      for (const key of keys) {
        if (!env[key]) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [key],
            message: `is required when ${selector} is SMTP`,
          });
        }
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
