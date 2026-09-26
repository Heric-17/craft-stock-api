import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { Injectable } from '@nestjs/common';

import { EnvService } from '../../../config/env.service';
import { ImageUploadFailedError } from '../../domain/errors/image-upload-failed.error';
import type { StorageProvider, UploadableFile } from '../../domain/storage/storage-provider';
import { StructuredLogger } from '../logging/structured-logger.service';
import { buildStorageKey } from './build-storage-key';

/**
 * Development backend for `StorageProvider`: writes straight to a directory
 * on the host filesystem, created on first use. `main.ts` serves that same
 * directory statically under `/uploads` so a key round-trips to a reachable
 * URL locally without a real object store.
 */
@Injectable()
export class LocalDiskStorageProvider implements StorageProvider {
  constructor(
    private readonly env: EnvService,
    private readonly logger: StructuredLogger,
  ) {}

  async upload(file: UploadableFile): Promise<string> {
    const key = buildStorageKey(file.mimeType);
    const destination = join(this.rootDir, key);

    try {
      await mkdir(this.rootDir, { recursive: true });
      await writeFile(destination, file.buffer);
    } catch (error) {
      this.logger.error(
        `Failed to write image to local disk at "${destination}": ${String(error)}`,
        undefined,
        LocalDiskStorageProvider.name,
      );
      throw new ImageUploadFailedError(`Failed to store image on local disk (key ${key}).`, error);
    }

    return key;
  }

  async delete(key: string): Promise<void> {
    try {
      // `force: true`: deleting a key that is already gone is not a failure.
      await rm(join(this.rootDir, key), { force: true });
    } catch (error) {
      this.logger.error(
        `Failed to delete image "${key}" from local disk: ${String(error)}`,
        undefined,
        LocalDiskStorageProvider.name,
      );
      throw new ImageUploadFailedError(
        `Failed to delete image from local disk (key ${key}).`,
        error,
      );
    }
  }

  private get rootDir(): string {
    return this.env.get('UPLOADS_DIR');
  }
}
