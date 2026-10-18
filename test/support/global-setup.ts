import { execFileSync } from 'node:child_process';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';

declare global {
  // `declare global` augmentation has no ES-module equivalent, and a global
  // variable can only be declared with `var` — this is the standard shape
  // for handing a value from `globalSetup` to the matching `globalTeardown`,
  // the only other file Jest runs in the same process.
  var __CRAFTSTOCK_PG_CONTAINER__: StartedPostgreSqlContainer | undefined;
  var __CRAFTSTOCK_UPLOADS_DIR__: string | undefined;
}

/**
 * Starts a throwaway Postgres for the e2e suite and points `DATABASE_URL` at
 * it, so `npm run test:e2e` needs nothing pre-running — no docker-compose,
 * no CI service container. Same image pinned in docker-compose.yml and the
 * CI workflow, for the same version-parity reason documented there.
 *
 * Plain assignment, not dotenv: it must unconditionally override whatever
 * `DATABASE_URL` the environment already set (a CI job-level throwaway
 * value, or a developer's own `.env`), and `process.env` set here is what
 * Jest actually propagates to every test file — `globalThis` is not a
 * reliable channel to them, only back to `globalTeardown`.
 *
 * Storage gets the same treatment. Images always go to local disk, in a
 * throwaway directory removed by `globalTeardown`, whatever the developer's
 * `.env` says: a run must never write to the real `uploads/` folder, and
 * above all never to a real bucket, where nothing would clean it up.
 */
export default async function globalSetup(): Promise<void> {
  const uploadsDir = await mkdtemp(join(tmpdir(), 'craftstock-e2e-uploads-'));

  process.env.STORAGE_PROVIDER = 'LOCAL_DISK';
  process.env.UPLOADS_DIR = uploadsDir;
  globalThis.__CRAFTSTOCK_UPLOADS_DIR__ = uploadsDir;

  // The suite signs in over and over from one address, which is exactly what
  // the rate limit exists to refuse. Out of the way for every spec by default;
  // `rate-limit.e2e-spec.ts` sets its own, tight values before it builds its
  // app. A developer's `.env` can not loosen or tighten this either.
  process.env.RATE_LIMIT_DEFAULT_LIMIT = '100000';
  process.env.RATE_LIMIT_AUTH_LIMIT = '100000';
  process.env.RATE_LIMIT_RECOVERY_LIMIT = '100000';
  delete process.env.TRUST_PROXY;

  const container = await new PostgreSqlContainer('postgres:18-alpine').start();

  process.env.DATABASE_URL = container.getConnectionUri();

  execFileSync('npx', ['prisma', 'migrate', 'deploy'], {
    env: process.env,
    stdio: 'inherit',
    shell: true,
  });

  globalThis.__CRAFTSTOCK_PG_CONTAINER__ = container;
}
