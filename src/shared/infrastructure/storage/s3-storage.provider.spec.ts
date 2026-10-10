import { DeleteObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

import type { EnvService } from '../../../config/env.service';
import { ImageUploadFailedError } from '../../domain/errors/image-upload-failed.error';
import type { StructuredLogger } from '../logging/structured-logger.service';
import { S3StorageProvider } from './s3-storage.provider';

function buildEnv(overrides: Record<string, unknown> = {}): EnvService {
  const values: Record<string, unknown> = {
    S3_BUCKET_NAME: 'craftstock-images',
    S3_REGION: 'us-east-1',
    S3_PUBLIC_BASE_URL: 'https://images.empresa.com.br',
    ...overrides,
  };
  return { get: (key: string) => values[key] } as unknown as EnvService;
}

function buildLogger(): { logger: StructuredLogger; errors: string[] } {
  const errors: string[] = [];
  const logger = {
    error: (message: string) => errors.push(message),
  } as unknown as StructuredLogger;
  return { logger, errors };
}

describe('S3StorageProvider', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('uploads the file under a generated key and returns it', async () => {
    const send = jest.spyOn(S3Client.prototype, 'send').mockResolvedValue({} as never);
    const provider = new S3StorageProvider(buildEnv(), buildLogger().logger);

    const key = await provider.upload({ buffer: Buffer.from('x'), mimeType: 'image/png' });

    expect(key).toMatch(/^[0-9a-f-]{36}\.png$/);
    expect(send).toHaveBeenCalledTimes(1);
    const command = send.mock.calls[0][0] as PutObjectCommand;
    expect(command).toBeInstanceOf(PutObjectCommand);
    expect(command.input.Bucket).toBe('craftstock-images');
    expect(command.input.Key).toBe(key);
    // Written onto the object itself, because that is what carries it to
    // every reader afterwards. A key is never reused, so the bytes behind
    // one URL never change and a year-long cache is safe.
    expect(command.input.CacheControl).toBe('public, max-age=31536000, immutable');
  });

  it('deletes a key', async () => {
    const send = jest.spyOn(S3Client.prototype, 'send').mockResolvedValue({} as never);
    const provider = new S3StorageProvider(buildEnv(), buildLogger().logger);

    await provider.delete('some-key.png');

    const command = send.mock.calls[0][0] as DeleteObjectCommand;
    expect(command).toBeInstanceOf(DeleteObjectCommand);
    expect(command.input.Bucket).toBe('craftstock-images');
    expect(command.input.Key).toBe('some-key.png');
  });

  it('logs by name and wraps the failure in ImageUploadFailedError instead of swallowing it', async () => {
    jest.spyOn(S3Client.prototype, 'send').mockRejectedValue(new Error('network down') as never);
    const { logger, errors } = buildLogger();
    const provider = new S3StorageProvider(buildEnv(), logger);

    await expect(
      provider.upload({ buffer: Buffer.from('x'), mimeType: 'image/png' }),
    ).rejects.toThrow(ImageUploadFailedError);

    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('network down');
  });

  describe('publicUrl', () => {
    it('appends the key to the configured public base', () => {
      const provider = new S3StorageProvider(buildEnv(), buildLogger().logger);

      expect(provider.publicUrl('abc.png')).toBe('https://images.empresa.com.br/abc.png');
    });

    it('tolerates a trailing slash on the configured base', () => {
      const provider = new S3StorageProvider(
        buildEnv({ S3_PUBLIC_BASE_URL: 'https://images.empresa.com.br/' }),
        buildLogger().logger,
      );

      expect(provider.publicUrl('abc.png')).toBe('https://images.empresa.com.br/abc.png');
    });

    /**
     * The base is configuration, never assembled from bucket and region:
     * an installation behind a CDN or a custom domain reads at neither.
     */
    it('fails loudly when the public base was never configured', () => {
      const provider = new S3StorageProvider(
        buildEnv({ S3_PUBLIC_BASE_URL: undefined }),
        buildLogger().logger,
      );

      expect(() => provider.publicUrl('abc.png')).toThrow(ImageUploadFailedError);
    });

    /**
     * The bucket is public for reads, so what keeps an object from being
     * found is only that its key is an unguessable UUID — never anything
     * derived from the uploaded file name.
     */
    it('builds the URL from the generated key alone', async () => {
      jest.spyOn(S3Client.prototype, 'send').mockResolvedValue({} as never);
      const provider = new S3StorageProvider(buildEnv(), buildLogger().logger);

      const key = await provider.upload({ buffer: Buffer.from('x'), mimeType: 'image/jpeg' });

      expect(key).toMatch(/^[0-9a-f-]{36}\.jpg$/);
      expect(provider.publicUrl(key)).toBe(`https://images.empresa.com.br/${key}`);
    });
  });
});
