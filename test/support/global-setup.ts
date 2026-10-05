import { execFileSync } from 'node:child_process';

import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';

declare global {
  // `declare global` augmentation has no ES-module equivalent, and a global
  // variable can only be declared with `var` — this is the standard shape
  // for handing a value from `globalSetup` to the matching `globalTeardown`,
  // the only other file Jest runs in the same process.
  var __CRAFTSTOCK_PG_CONTAINER__: StartedPostgreSqlContainer | undefined;
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
 */
export default async function globalSetup(): Promise<void> {
  const container = await new PostgreSqlContainer('postgres:18-alpine').start();

  process.env.DATABASE_URL = container.getConnectionUri();

  execFileSync('npx', ['prisma', 'migrate', 'deploy'], {
    env: process.env,
    stdio: 'inherit',
    shell: true,
  });

  globalThis.__CRAFTSTOCK_PG_CONTAINER__ = container;
}
