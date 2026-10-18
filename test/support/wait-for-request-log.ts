import type { PrismaService } from '../../src/shared/infrastructure/prisma/prisma.service';

type RequestLogWhere = NonNullable<
  Parameters<PrismaService['requestLog']['findFirst']>[0]
>['where'];

const DEFAULT_TIMEOUT_MS = 3000;
const POLL_INTERVAL_MS = 50;

/**
 * The request row is written on the response's `finish` event, deliberately
 * outside the business transaction, so it lands a moment after the client
 * already has its answer. A test that reads it straight after the response
 * races that write; this polls until the row shows up.
 */
export async function waitForRequestLog(
  prisma: PrismaService,
  where: RequestLogWhere,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
) {
  const deadline = Date.now() + timeoutMs;

  for (;;) {
    const row = await prisma.requestLog.findFirst({ where });

    if (row) {
      return row;
    }

    if (Date.now() >= deadline) {
      throw new Error(
        `No RequestLog row matching ${JSON.stringify(where)} appeared within ${timeoutMs}ms`,
      );
    }

    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
}
