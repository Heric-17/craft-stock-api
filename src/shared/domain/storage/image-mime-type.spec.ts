import { UnsupportedImageMimeTypeError } from '../errors/unsupported-image-mime-type.error';
import { ALLOWED_IMAGE_MIME_TYPES, extensionForImageMimeType } from './image-mime-type';

describe('extensionForImageMimeType', () => {
  it.each([
    ['image/jpeg', 'jpg'],
    ['image/png', 'png'],
    ['image/webp', 'webp'],
  ])('maps %s to .%s', (mimeType, extension) => {
    expect(extensionForImageMimeType(mimeType)).toBe(extension);
  });

  it('throws UnsupportedImageMimeTypeError for anything outside the allowed set', () => {
    expect(() => extensionForImageMimeType('application/pdf')).toThrow(
      UnsupportedImageMimeTypeError,
    );
  });

  it('lists every mime type it accepts', () => {
    expect(ALLOWED_IMAGE_MIME_TYPES).toEqual(['image/jpeg', 'image/png', 'image/webp']);
  });
});
