import {
  BadRequestException,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';

import type { EnvService } from '../../../config/env.service';
import { ALLOWED_IMAGE_MIME_TYPES } from '../../domain/storage/image-mime-type';

/**
 * Shared multipart validation for `Material` and `CompositeProduct` image
 * uploads: present, an allowed MIME type, within the configured size ceiling.
 * A plain function rather than a `PipeTransform` so it can read `EnvService`
 * without relying on Nest's DI resolving a class reference passed to
 * `@UploadedFile()`.
 *
 * @throws BadRequestException when no file was sent.
 * @throws UnsupportedMediaTypeException when the MIME type is not allowed.
 * @throws PayloadTooLargeException when the file exceeds MAX_IMAGE_UPLOAD_SIZE_BYTES.
 */
export function validateImageFile(
  file: Express.Multer.File | undefined,
  env: EnvService,
): Express.Multer.File {
  if (!file) {
    throw new BadRequestException('An image file is required.');
  }

  if (!ALLOWED_IMAGE_MIME_TYPES.includes(file.mimetype)) {
    throw new UnsupportedMediaTypeException(
      `Unsupported image type "${file.mimetype}". Allowed: ${ALLOWED_IMAGE_MIME_TYPES.join(', ')}.`,
    );
  }

  const maxSizeBytes = env.get('MAX_IMAGE_UPLOAD_SIZE_BYTES');

  if (file.size > maxSizeBytes) {
    throw new PayloadTooLargeException(
      `Image of ${file.size} bytes exceeds the maximum allowed size of ${maxSizeBytes} bytes.`,
    );
  }

  return file;
}
