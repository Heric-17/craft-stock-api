import { DomainError } from './domain.error';

/**
 * A `StorageProvider` could not complete an upload or a delete — a disk
 * write failed, or the S3 request errored.
 *
 * On upload this is never swallowed: the operation that triggered it fails
 * too, so an image is never referenced by a `Material` or `CompositeProduct`
 * unless it is actually sitting in storage.
 *
 * On the delete of an image nothing references any more it is logged and
 * swallowed instead, by `discardStoredImage` — that cleanup runs after the
 * database has already committed, and failing there would report a durable
 * write as a 503. Providers still throw it in both cases; what differs is
 * whether the caller lets it escape.
 */
export class ImageUploadFailedError extends DomainError {
  constructor(
    message: string,
    override readonly cause?: unknown,
  ) {
    super(message);
  }
}
