import { z } from 'zod';

export const LOG_LEVELS = ['error', 'warn', 'info', 'debug', 'verbose'] as const;

export type LogLevel = (typeof LOG_LEVELS)[number];

export const NODE_ENVS = ['development', 'test', 'production'] as const;

const POSTGRES_URL = /^postgres(ql)?:\/\/.+/;

export const envSchema = z.object({
  NODE_ENV: z.enum(NODE_ENVS).default('development'),
  PORT: z.coerce.number().int().positive().max(65535).default(3000),
  LOG_LEVEL: z.enum(LOG_LEVELS).default('info'),
  DATABASE_URL: z
    .string()
    .min(1, 'is required')
    .regex(POSTGRES_URL, 'must be a PostgreSQL connection string (postgresql://...)'),
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
