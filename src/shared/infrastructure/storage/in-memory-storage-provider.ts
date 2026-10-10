import { randomUUID } from 'node:crypto';

import { ImageUploadFailedError } from '../../domain/errors/image-upload-failed.error';
import type {
  StorageProvider,
  StorageProviderFactory,
  UploadableFile,
} from '../../domain/storage/storage-provider';

/** In-memory `StorageProvider` for `application/` tests. Never mocks the real backends. */
export class InMemoryStorageProvider implements StorageProvider {
  private readonly filesByKey = new Map<string, UploadableFile>();

  async upload(file: UploadableFile): Promise<string> {
    const key = randomUUID();
    this.filesByKey.set(key, file);
    return Promise.resolve(key);
  }

  async delete(key: string): Promise<void> {
    this.filesByKey.delete(key);
    return Promise.resolve();
  }

  /**
   * A fixed, obviously fake base, so a test can assert that a view exposes
   * an absolute URL built from the key — never the bare key — without caring
   * which backend produced it.
   */
  publicUrl(key: string): string {
    return `${InMemoryStorageProvider.PUBLIC_BASE}/${key}`;
  }

  static readonly PUBLIC_BASE = 'https://images.test/uploads';

  has(key: string): boolean {
    return this.filesByKey.has(key);
  }
}

/**
 * Stores uploads like its parent but always fails to delete, so a test can
 * exercise the cleanup path without mocking a real backend. `has` still
 * reports the key as present, which is the point: the object stays orphaned
 * in storage while the operation itself has to succeed anyway.
 */
export class DeleteFailingStorageProvider extends InMemoryStorageProvider {
  override delete(key: string): Promise<void> {
    return Promise.reject(new ImageUploadFailedError(`Failed to delete image (key ${key}).`));
  }
}

/** Always hands back the same `InMemoryStorageProvider`, so a test can inspect what it did. */
export class InMemoryStorageProviderFactory implements StorageProviderFactory {
  constructor(private readonly provider: InMemoryStorageProvider = new InMemoryStorageProvider()) {}

  create(): StorageProvider {
    return this.provider;
  }
}
