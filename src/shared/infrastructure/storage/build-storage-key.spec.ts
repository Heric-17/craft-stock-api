import { UnsupportedImageMimeTypeError } from '../../domain/errors/unsupported-image-mime-type.error';
import { buildStorageKey } from './build-storage-key';

/** A v4 UUID, by the layout the version and variant nibbles impose. */
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('buildStorageKey', () => {
  it('generates a UUID-based key with the extension matching the MIME type', () => {
    const key = buildStorageKey('image/png');

    expect(key).toMatch(/^[0-9a-f-]{36}\.png$/);
  });

  /**
   * Load-bearing, not cosmetic: the bucket is public for reads at a fixed
   * URL (docs/DEPLOY.md), so the only thing standing between an image and
   * anyone who wants to find it is that its name carries 122 random bits.
   * A key built from a counter, a timestamp or the uploaded file name would
   * make every stored image enumerable.
   */
  it('names the file with a random v4 UUID, which is what makes the public URL unguessable', () => {
    const [name, extension] = buildStorageKey('image/jpeg').split('.');

    expect(name).toMatch(UUID_V4);
    expect(extension).toBe('jpg');
  });

  it('never derives any part of the key from the caller, which only supplies a MIME type', () => {
    // The signature is the guarantee: there is no parameter a file name
    // could arrive through. This pins it so widening it is a deliberate act.
    expect(buildStorageKey).toHaveLength(1);
  });

  it('never reuses a key across calls', () => {
    const first = buildStorageKey('image/jpeg');
    const second = buildStorageKey('image/jpeg');

    expect(first).not.toBe(second);
  });

  it('throws for a MIME type it does not recognize', () => {
    expect(() => buildStorageKey('text/plain')).toThrow(UnsupportedImageMimeTypeError);
  });
});
