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

export const envSchema = z.object({
  NODE_ENV: z.enum(NODE_ENVS).default('development'),
  PORT: z.coerce.number().int().positive().max(65535).default(3000),
  LOG_LEVEL: z.enum(LOG_LEVELS).default('info'),
  DATABASE_URL: z
    .string()
    .min(1, 'is required')
    .regex(POSTGRES_URL, 'must be a PostgreSQL connection string (postgresql://...)'),
  NFCE_PROVIDER: z.enum(NFCE_PROVIDERS).default('AUTO'),
  // The state portals drop requests under load rather than answering slowly,
  // so an import is attempted a few times before the capture is parked as
  // UNSTABLE. Only transport failures are retried: a page that came back and
  // is not a note will not become one on a second read.
  NFCE_IMPORT_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(10).default(3),
  // Base of the progressive wait between attempts, doubled each time.
  NFCE_IMPORT_RETRY_DELAY_MS: z.coerce.number().int().min(0).max(60_000).default(1_000),
  // HMAC signing key for session JWTs. Required with no default: a hardcoded
  // fallback would mean every installation that forgets to set it shares the
  // same key.
  JWT_SECRET: z.string().min(32, 'must be at least 32 characters long'),
  // Short on purpose: the access token is silently traded for a new one
  // through /auth/refresh, so its exposure window stays small regardless of
  // how long the session actually lasts.
  JWT_EXPIRES_IN_SECONDS: z.coerce.number().int().positive().default(900),
  // The refresh token is what actually keeps someone logged in across
  // requests. 30 days by default — persisted, rotated on every use, and
  // revocable, unlike the access token above.
  REFRESH_TOKEN_EXPIRES_IN_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .default(30 * 24 * 60 * 60),
  // argon2's time cost (iteration count). memoryCost and parallelism stay at
  // the library's own defaults; this is the one knob "custo configurável por
  // ambiente" asks for.
  ARGON2_TIME_COST: z.coerce.number().int().min(1).max(10).default(3),
  // §15.2: how long AuditLog and RequestLog rows are kept before the daily
  // retention job prunes them. Separate knobs because RequestLog is more
  // operational noise (one row per mutating request) than AuditLog, which is
  // the actual investigation trail.
  AUDIT_LOG_RETENTION_DAYS: z.coerce.number().int().min(1).default(180),
  REQUEST_LOG_RETENTION_DAYS: z.coerce.number().int().min(1).default(30),
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
