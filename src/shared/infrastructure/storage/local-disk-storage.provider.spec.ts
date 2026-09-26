import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { EnvService } from '../../../config/env.service';
import { UnsupportedImageMimeTypeError } from '../../domain/errors/unsupported-image-mime-type.error';
import type { StructuredLogger } from '../logging/structured-logger.service';
import { LocalDiskStorageProvider } from './local-disk-storage.provider';

const SILENT_LOGGER = { error: () => undefined } as unknown as StructuredLogger;

const UUID_JPG = /^[0-9a-f-]{36}\.jpg$/;

async function withTempDir(run: (dir: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), 'craftstock-uploads-'));

  try {
    await run(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function buildProvider(dir: string): LocalDiskStorageProvider {
  const env = { get: () => dir } as unknown as EnvService;
  return new LocalDiskStorageProvider(env, SILENT_LOGGER);
}

describe('LocalDiskStorageProvider', () => {
  it('writes the file under a UUID key derived from the MIME type, never the original name', async () => {
    await withTempDir(async (dir) => {
      const provider = buildProvider(dir);

      const key = await provider.upload({ buffer: Buffer.from('hello'), mimeType: 'image/jpeg' });

      expect(key).toMatch(UUID_JPG);
      const written = await readFile(join(dir, key));
      expect(written.toString()).toBe('hello');
    });
  });

  it('creates the root directory on first use', async () => {
    await withTempDir(async (dir) => {
      const nested = join(dir, 'nested', 'uploads');
      const provider = buildProvider(nested);

      const key = await provider.upload({ buffer: Buffer.from('x'), mimeType: 'image/png' });

      const written = await readFile(join(nested, key));
      expect(written.toString()).toBe('x');
    });
  });

  it('deletes a stored file', async () => {
    await withTempDir(async (dir) => {
      const provider = buildProvider(dir);
      const key = await provider.upload({ buffer: Buffer.from('bye'), mimeType: 'image/webp' });

      await provider.delete(key);

      await expect(readFile(join(dir, key))).rejects.toThrow();
    });
  });

  it('is idempotent: deleting a key that was never written does not throw', async () => {
    await withTempDir(async (dir) => {
      const provider = buildProvider(dir);

      await expect(provider.delete('does-not-exist.png')).resolves.toBeUndefined();
    });
  });

  it('rejects a MIME type outside the allowed set before touching the filesystem', async () => {
    await withTempDir(async (dir) => {
      const provider = buildProvider(dir);

      await expect(
        provider.upload({ buffer: Buffer.from('x'), mimeType: 'application/pdf' }),
      ).rejects.toThrow(UnsupportedImageMimeTypeError);
    });
  });
});
