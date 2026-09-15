import 'dotenv/config';

import { defineConfig, env } from 'prisma/config';

/**
 * Configuration for the Prisma CLI (generate, validate, migrate). Since Prisma 7
 * the connection URL lives here instead of in schema.prisma, and environment
 * variables are no longer loaded automatically — hence `dotenv/config`.
 *
 * This is build-time configuration only. At runtime the application reads
 * DATABASE_URL through the validated EnvService and hands it to the driver
 * adapter in PrismaService.
 */
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: env('DATABASE_URL'),
  },
});
