import { Test } from '@nestjs/testing';

import type { StorageProviderFactory } from '../../domain/storage/storage-provider';
import { STORAGE_PROVIDER_FACTORY } from '../../domain/storage/storage-provider';
import { LocalDiskStorageProvider } from './local-disk-storage.provider';
import { S3StorageProvider } from './s3-storage.provider';
import { StorageModule } from './storage.module';

/**
 * Builds the module through the real container, catching a token mismatch or
 * a missing registration that a fake-based service test would never see.
 */
describe('StorageModule wiring', () => {
  it('resolves the factory through the container, defaulting to local disk', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [StorageModule],
    }).compile();

    const factory = moduleRef.get<StorageProviderFactory>(STORAGE_PROVIDER_FACTORY);

    /**
     * The acceptance criterion for the Factory pattern: the factory hands
     * back the very instance the container built, never one of its own.
     */
    expect(factory.create()).toBe(moduleRef.get(LocalDiskStorageProvider));
    expect(moduleRef.get(S3StorageProvider)).toBeInstanceOf(S3StorageProvider);

    await moduleRef.close();
  });
});
