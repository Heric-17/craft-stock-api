import { Test, type TestingModule } from '@nestjs/testing';

import { EnvService } from '../../../config/env.service';
import type { StorageProviderKind } from '../../../config/env.schema';
import type { StorageProviderFactory } from '../../domain/storage/storage-provider';
import { STORAGE_PROVIDER_FACTORY } from '../../domain/storage/storage-provider';
import { LocalDiskStorageProvider } from './local-disk-storage.provider';
import { S3StorageProvider } from './s3-storage.provider';
import { StorageModule } from './storage.module';

/**
 * Builds the module through the real container, catching a token mismatch or
 * a missing registration that a fake-based service test would never see.
 *
 * `EnvService` is pinned rather than inherited from `.env`: the selection is
 * the whole subject of this test, so reading the real environment would make
 * the result depend on whichever backend the machine running the suite is
 * configured for. That the schema defaults `STORAGE_PROVIDER` to
 * `LOCAL_DISK` is asserted where the default lives, in `env.schema.spec.ts`.
 */
describe('StorageModule wiring', () => {
  function compileWith(storageProvider: StorageProviderKind): Promise<TestingModule> {
    return Test.createTestingModule({ imports: [StorageModule] })
      .overrideProvider(EnvService)
      .useValue({ get: () => storageProvider })
      .compile();
  }

  /**
   * The acceptance criterion for the Factory pattern: the factory hands back
   * the very instance the container built, never one of its own.
   */
  it.each([
    ['LOCAL_DISK', LocalDiskStorageProvider],
    ['S3', S3StorageProvider],
  ] as const)(
    'resolves the factory through the container and selects %s',
    async (kind, expected) => {
      const moduleRef = await compileWith(kind);

      const factory = moduleRef.get<StorageProviderFactory>(STORAGE_PROVIDER_FACTORY);

      expect(factory.create()).toBe(moduleRef.get(expected));

      await moduleRef.close();
    },
  );

  it('registers both providers, so the factory never has to construct one', async () => {
    const moduleRef = await compileWith('LOCAL_DISK');

    expect(moduleRef.get(LocalDiskStorageProvider)).toBeInstanceOf(LocalDiskStorageProvider);
    expect(moduleRef.get(S3StorageProvider)).toBeInstanceOf(S3StorageProvider);

    await moduleRef.close();
  });
});
