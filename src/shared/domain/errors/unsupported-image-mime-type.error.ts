import { DomainError } from './domain.error';

/**
 * Defense in depth: the presentation layer already rejects an unsupported
 * MIME type before a file reaches a `StorageProvider`, but the provider
 * checks again rather than trusting the caller, so it never derives a key it
 * cannot round-trip.
 */
export class UnsupportedImageMimeTypeError extends DomainError {
  constructor(readonly mimeType: string) {
    super(`Unsupported image MIME type "${mimeType}".`);
  }
}
