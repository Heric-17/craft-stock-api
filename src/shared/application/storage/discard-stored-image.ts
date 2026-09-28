import type { StorageProvider } from '../../domain/storage/storage-provider';
import type { StructuredLogger } from '../../infrastructure/logging/structured-logger.service';

/**
 * Deletes a stored image that nothing references any more: the previous key
 * after a replacement, or the current key after `imageUrl` was cleared.
 *
 * Never rejects, and that is the whole point of it existing. Both callers run
 * this only after their database transaction has already committed, so a
 * cleanup failure allowed to escape would answer a request that genuinely
 * succeeded with `ImageUploadFailedError` — a 503 for a write that is
 * durable. The client would then retry an operation that needs no retry, and
 * the record it reads back would contradict the error it just got.
 *
 * The object is unreferenced either way: propagating the failure does not
 * reclaim it, it only adds a wrong status code on top. So the failure is
 * logged and swallowed. Deleting an image IS part of the contract of the
 * request that clears it, but the delete of the key being *replaced* is not,
 * and neither is a delete that the database has already forgotten about.
 */
export async function discardStoredImage(
  provider: StorageProvider,
  key: string,
  logger: StructuredLogger,
  context: string,
): Promise<void> {
  try {
    await provider.delete(key);
  } catch (error) {
    logger.error(
      `Orphaned stored image "${key}": nothing references it any more, but deleting it from storage failed: ${String(error)}`,
      undefined,
      context,
    );
  }
}
