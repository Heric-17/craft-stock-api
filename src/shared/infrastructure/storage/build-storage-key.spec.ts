import { UnsupportedImageMimeTypeError } from '../../domain/errors/unsupported-image-mime-type.error';
import { buildStorageKey } from './build-storage-key';

describe('buildStorageKey', () => {
  it('generates a UUID-based key with the extension matching the MIME type', () => {
    const key = buildStorageKey('image/png');

    expect(key).toMatch(/^[0-9a-f-]{36}\.png$/);
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
