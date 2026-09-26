import { Injectable } from '@nestjs/common';

import { EnvService } from '../../../config/env.service';
import type {
  StorageProvider,
  StorageProviderFactory as StorageProviderFactoryPort,
} from '../../domain/storage/storage-provider';
import { LocalDiskStorageProvider } from './local-disk-storage.provider';
import { S3StorageProvider } from './s3-storage.provider';

/**
 * Chooses which `StorageProvider` backs image uploads for the whole
 * installation, purely from `STORAGE_PROVIDER`.
 *
 * Both implementations arrive through the constructor, already built by the
 * container, and this class only ever picks one of them — never `new`, which
 * would construct it outside the container and lose whatever the container
 * injects into it (the env service, the logger).
 */
@Injectable()
export class EnvStorageProviderFactory implements StorageProviderFactoryPort {
  constructor(
    private readonly localDisk: LocalDiskStorageProvider,
    private readonly s3: S3StorageProvider,
    private readonly env: EnvService,
  ) {}

  create(): StorageProvider {
    switch (this.env.get('STORAGE_PROVIDER')) {
      case 'S3':
        return this.s3;
      case 'LOCAL_DISK':
        return this.localDisk;
    }
  }
}
