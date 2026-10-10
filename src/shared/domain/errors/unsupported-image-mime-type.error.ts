import { DomainError } from './domain.error';

export interface UnsupportedImageMimeTypeDetails {
  mimeType: string;
  /** What the picker should offer instead, so the list lives in one place. */
  supported: readonly string[];
}

/**
 * Defense in depth: the presentation layer already rejects an unsupported
 * MIME type before a file reaches a `StorageProvider`, but the provider
 * checks again rather than trusting the caller, so it never derives a key it
 * cannot round-trip.
 */
export class UnsupportedImageMimeTypeError extends DomainError<UnsupportedImageMimeTypeDetails> {
  constructor(
    readonly mimeType: string,
    supported: readonly string[] = [],
  ) {
    super(`Unsupported image MIME type "${mimeType}".`, { mimeType, supported });
  }
}
