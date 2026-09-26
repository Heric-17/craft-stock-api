import { Module } from '@nestjs/common';

import { EnvModule } from '../../../config/env.module';
import { STORAGE_PROVIDER_FACTORY } from '../../domain/storage/storage-provider';
import { LoggingModule } from '../logging/logging.module';
import { LocalDiskStorageProvider } from './local-disk-storage.provider';
import { EnvStorageProviderFactory } from './storage-provider.factory';
import { S3StorageProvider } from './s3-storage.provider';

@Module({
  imports: [EnvModule, LoggingModule],
  providers: [
    // Registered so the container builds each one with its own dependencies.
    // The factory receives them and only ever selects — see the comment on
    // EnvStorageProviderFactory.
    LocalDiskStorageProvider,
    S3StorageProvider,
    { provide: STORAGE_PROVIDER_FACTORY, useClass: EnvStorageProviderFactory },
  ],
  exports: [STORAGE_PROVIDER_FACTORY],
})
export class StorageModule {}
