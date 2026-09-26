import { UnsupportedImageMimeTypeError } from '../errors/unsupported-image-mime-type.error';

/**
 * Closed list of image types this system accepts for a `Material` or
 * `CompositeProduct` picture. Doubles as the source of the file extension a
 * `StorageProvider` writes the upload under, so the presentation-layer
 * validation and the persisted key never disagree about what is allowed.
 */
const IMAGE_EXTENSION_BY_MIME_TYPE: Readonly<Record<string, string>> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export const ALLOWED_IMAGE_MIME_TYPES: readonly string[] = Object.keys(
  IMAGE_EXTENSION_BY_MIME_TYPE,
);

/** @throws UnsupportedImageMimeTypeError when `mimeType` is outside the allowed set. */
export function extensionForImageMimeType(mimeType: string): string {
  const extension = IMAGE_EXTENSION_BY_MIME_TYPE[mimeType];

  if (extension === undefined) {
    throw new UnsupportedImageMimeTypeError(mimeType);
  }

  return extension;
}
