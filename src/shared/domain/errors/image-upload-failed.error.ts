import { DomainError } from './domain.error';

/**
 * A `StorageProvider` could not complete an upload or a delete — a disk
 * write failed, or the S3 request errored. Never swallowed: the operation
 * that triggered it fails too, so an image is never referenced by a
 * `Material` or `CompositeProduct` unless it is actually sitting in storage.
 */
export class ImageUploadFailedError extends DomainError {
  constructor(
    message: string,
    override readonly cause?: unknown,
  ) {
    super(message);
  }
}
