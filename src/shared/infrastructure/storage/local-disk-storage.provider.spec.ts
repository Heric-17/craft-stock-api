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

interface ProviderEnv {
  uploadsDir: string;
  publicBaseUrl?: string;
  port?: number;
}

function buildProvider(
  dir: string,
  overrides: Partial<ProviderEnv> = {},
): LocalDiskStorageProvider {
  const values: Record<string, unknown> = {
    UPLOADS_DIR: dir,
    PUBLIC_BASE_URL: overrides.publicBaseUrl,
    PORT: overrides.port ?? 3000,
  };
  const env = { get: (key: string) => values[key] } as unknown as EnvService;

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

  describe('publicUrl', () => {
    // No temp directory here: resolving a key touches no filesystem, which
    // is itself part of the contract — a view mapper calls this per row.
    it('resolves a key against the configured public base and the static mount', () => {
      const provider = buildProvider('unused', { publicBaseUrl: 'https://api.empresa.com.br' });

      expect(provider.publicUrl('abc.png')).toBe('https://api.empresa.com.br/uploads/abc.png');
    });

    it('tolerates a trailing slash on the configured base', () => {
      const provider = buildProvider('unused', { publicBaseUrl: 'https://api.empresa.com.br/' });

      expect(provider.publicUrl('abc.png')).toBe('https://api.empresa.com.br/uploads/abc.png');
    });

    it('falls back to loopback on the configured port in development', () => {
      const provider = buildProvider('unused', { port: 4000 });

      expect(provider.publicUrl('abc.png')).toBe('http://localhost:4000/uploads/abc.png');
    });

    /**
     * The bucket and this mount are both public, so what keeps an image from
     * being enumerated is only that its key is an unguessable UUID. A URL
     * that leaked any part of the uploaded file name would undo that.
     */
    it('builds the URL from the generated key alone, never the uploaded file name', async () => {
      await withTempDir(async (dir) => {
        const provider = buildProvider(dir, { publicBaseUrl: 'https://api.empresa.com.br' });

        const key = await provider.upload({
          buffer: Buffer.from('bytes'),
          mimeType: 'image/jpeg',
        });

        expect(key).toMatch(UUID_JPG);
        expect(provider.publicUrl(key)).toBe(`https://api.empresa.com.br/uploads/${key}`);
      });
    });
  });
});
