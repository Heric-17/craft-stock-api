import { rm } from 'node:fs/promises';

/**
 * Stops the container `globalSetup` started and removes the throwaway uploads
 * directory it created. Reads both back from `globalThis` rather than from a
 * file or an IPC channel, because `globalSetup` and `globalTeardown` are the
 * one pair of Jest lifecycle files guaranteed to run in the same process.
 */
export default async function globalTeardown(): Promise<void> {
  await globalThis.__CRAFTSTOCK_PG_CONTAINER__?.stop();

  if (globalThis.__CRAFTSTOCK_UPLOADS_DIR__ !== undefined) {
    await rm(globalThis.__CRAFTSTOCK_UPLOADS_DIR__, { recursive: true, force: true });
  }
}
