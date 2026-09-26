export const STORAGE_PROVIDER_FACTORY = Symbol('STORAGE_PROVIDER_FACTORY');

/** Raw bytes handed to a `StorageProvider`, already read off the multipart request. */
export interface UploadableFile {
  readonly buffer: Buffer;
  readonly mimeType: string;
}

/**
 * Where a `Material` or `CompositeProduct` image is written to. One contract,
 * two backends: the local filesystem in development, an S3 bucket in
 * production.
 *
 * `upload` generates its own key — a UUID plus an extension derived from
 * `mimeType`, never the file name the client sent — and returns it. Callers
 * persist that key, and only that key: never a host-qualified URL, so the
 * data stays portable across environments and domains.
 */
export interface StorageProvider {
  upload(file: UploadableFile): Promise<string>;
  /** Idempotent: deleting a key that is already gone is not an error. */
  delete(key: string): Promise<void>;
}

/**
 * Picks the `StorageProvider` for the running installation. Implemented in
 * `infrastructure/`, where the concrete providers live; consumers only ever
 * see this interface and the `StorageProvider` it hands back.
 */
export interface StorageProviderFactory {
  create(): StorageProvider;
}
