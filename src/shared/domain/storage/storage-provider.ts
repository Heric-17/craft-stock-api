export const STORAGE_PROVIDER_FACTORY = Symbol('STORAGE_PROVIDER_FACTORY');

/** Raw bytes handed to a `StorageProvider`, already read off the multipart request. */
export interface UploadableFile {
  readonly buffer: Buffer;
  readonly mimeType: string;
}

export interface StorageProvider {
  upload(file: UploadableFile): Promise<string>;
  delete(key: string): Promise<void>;
  publicUrl(key: string): string;
}

export interface StorageProviderFactory {
  create(): StorageProvider;
}
