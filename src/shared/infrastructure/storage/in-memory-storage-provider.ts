import { randomUUID } from 'node:crypto';

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

  has(key: string): boolean {
    return this.filesByKey.has(key);
  }
}

/** Always hands back the same `InMemoryStorageProvider`, so a test can inspect what it did. */
export class InMemoryStorageProviderFactory implements StorageProviderFactory {
  constructor(private readonly provider: InMemoryStorageProvider = new InMemoryStorageProvider()) {}

  create(): StorageProvider {
    return this.provider;
  }
}
