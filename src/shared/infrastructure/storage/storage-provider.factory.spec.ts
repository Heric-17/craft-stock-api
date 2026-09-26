import type { EnvService } from '../../../config/env.service';
import type { Env } from '../../../config/env.schema';
import type { StructuredLogger } from '../logging/structured-logger.service';
import { LocalDiskStorageProvider } from './local-disk-storage.provider';
import { S3StorageProvider } from './s3-storage.provider';
import { EnvStorageProviderFactory } from './storage-provider.factory';

const NEVER_CALLED_LOGGER = {
  error: () => {
    throw new Error('The factory must not perform any I/O while selecting a provider.');
  },
} as unknown as StructuredLogger;

function buildFactory(storageProvider: Env['STORAGE_PROVIDER'] = 'LOCAL_DISK'): {
  factory: EnvStorageProviderFactory;
  localDisk: LocalDiskStorageProvider;
  s3: S3StorageProvider;
} {
  // Every implementation is built once and handed to the factory, exactly as
  // the container does it. The factory is expected to return one of these
  // very instances — never something it constructed itself.
  const env = { get: () => storageProvider } as unknown as EnvService;
  const localDisk = new LocalDiskStorageProvider(env, NEVER_CALLED_LOGGER);
  const s3 = new S3StorageProvider(env, NEVER_CALLED_LOGGER);

  return { factory: new EnvStorageProviderFactory(localDisk, s3, env), localDisk, s3 };
}

describe('EnvStorageProviderFactory', () => {
  it('selects the local disk provider by default', () => {
    const { factory, localDisk } = buildFactory('LOCAL_DISK');

    expect(factory.create()).toBe(localDisk);
  });

  it('selects the S3 provider when STORAGE_PROVIDER is S3', () => {
    const { factory, s3 } = buildFactory('S3');

    expect(factory.create()).toBe(s3);
  });

  /**
   * The factory only ever selects. An implementation built here with `new`
   * would sit outside the container, without the dependencies, scope and
   * lifecycle the container gave it.
   */
  it('returns the very instance it was given, never a new one', () => {
    const { factory, localDisk } = buildFactory('LOCAL_DISK');

    expect(factory.create()).toBe(localDisk);
    expect(factory.create()).toBe(localDisk);
  });

  it('switches provider purely from configuration, with no change at any call site', () => {
    const { factory: devFactory, localDisk } = buildFactory('LOCAL_DISK');
    const { factory: prodFactory, s3 } = buildFactory('S3');

    expect(devFactory.create()).toBe(localDisk);
    expect(prodFactory.create()).toBe(s3);
  });
});
