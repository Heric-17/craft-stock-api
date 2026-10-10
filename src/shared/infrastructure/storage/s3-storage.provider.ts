import { DeleteObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { Injectable } from '@nestjs/common';

import { EnvService } from '../../../config/env.service';
import { ImageUploadFailedError } from '../../domain/errors/image-upload-failed.error';
import { IMAGE_CACHE_CONTROL } from '../../domain/storage/image-delivery';
import type { StorageProvider, UploadableFile } from '../../domain/storage/storage-provider';
import { StructuredLogger } from '../logging/structured-logger.service';
import { buildStorageKey } from './build-storage-key';

/**
 * Production backend for `StorageProvider`. Credentials and region come from
 * the SDK's own default provider chain (`AWS_ACCESS_KEY_ID`,
 * `AWS_SECRET_ACCESS_KEY`, an attached instance role, ...) — nothing here
 * reads them directly. `S3_REGION` and `S3_BUCKET_NAME` are the only two
 * pieces of configuration specific to this application.
 */
@Injectable()
export class S3StorageProvider implements StorageProvider {
  private client: S3Client | undefined;

  constructor(
    private readonly env: EnvService,
    private readonly logger: StructuredLogger,
  ) {}

  async upload(file: UploadableFile): Promise<string> {
    const key = buildStorageKey(file.mimeType);

    try {
      await this.getClient().send(
        new PutObjectCommand({
          Bucket: this.bucketName,
          Key: key,
          Body: file.buffer,
          ContentType: file.mimeType,
          // Written at upload time because it is the object itself that
          // carries it to every reader afterwards — a key is a UUID and is
          // never reused, so the bytes behind one URL never change and
          // there is nothing to invalidate.
          CacheControl: IMAGE_CACHE_CONTROL,
        }),
      );
    } catch (error) {
      this.logger.error(
        `Failed to upload image "${key}" to S3 bucket "${this.bucketName}": ${String(error)}`,
        undefined,
        S3StorageProvider.name,
      );
      throw new ImageUploadFailedError(`Failed to upload image to S3 (key ${key}).`, error);
    }

    return key;
  }

  async delete(key: string): Promise<void> {
    try {
      await this.getClient().send(new DeleteObjectCommand({ Bucket: this.bucketName, Key: key }));
    } catch (error) {
      this.logger.error(
        `Failed to delete image "${key}" from S3 bucket "${this.bucketName}": ${String(error)}`,
        undefined,
        S3StorageProvider.name,
      );
      throw new ImageUploadFailedError(`Failed to delete image from S3 (key ${key}).`, error);
    }
  }

  /**
   * The bucket's public read base, from configuration — never assembled from
   * bucket and region here. An installation behind CloudFront or a custom
   * domain reads at neither, and a URL built in code would be wrong for it
   * with nothing to say so.
   */
  publicUrl(key: string): string {
    const base = this.env.get('S3_PUBLIC_BASE_URL');

    // Guarded at startup by envSchema's refinement whenever STORAGE_PROVIDER
    // is S3, same as the bucket name below.
    if (!base) {
      throw new ImageUploadFailedError('S3_PUBLIC_BASE_URL is not configured.');
    }

    return `${base.replace(/\/+$/, '')}/${key}`;
  }

  private get bucketName(): string {
    const bucket = this.env.get('S3_BUCKET_NAME');

    // Guarded at startup by envSchema's refinement whenever STORAGE_PROVIDER
    // is S3, so this only fires if something reaches into this class without
    // going through the factory.
    if (!bucket) {
      throw new ImageUploadFailedError('S3_BUCKET_NAME is not configured.');
    }

    return bucket;
  }

  private getClient(): S3Client {
    this.client ??= new S3Client({ region: this.env.get('S3_REGION') });
    return this.client;
  }
}
