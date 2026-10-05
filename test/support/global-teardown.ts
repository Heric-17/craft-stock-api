/**
 * Stops the container `globalSetup` started. Reads it back from `globalThis`
 * rather than from a file or an IPC channel, because `globalSetup` and
 * `globalTeardown` are the one pair of Jest lifecycle files guaranteed to
 * run in the same process.
 */
export default async function globalTeardown(): Promise<void> {
  await globalThis.__CRAFTSTOCK_PG_CONTAINER__?.stop();
}
