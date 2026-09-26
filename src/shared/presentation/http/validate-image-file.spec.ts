import {
  BadRequestException,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';

import type { EnvService } from '../../../config/env.service';
import { validateImageFile } from './validate-image-file';

function buildEnv(maxSizeBytes = 1024): EnvService {
  return { get: () => maxSizeBytes } as unknown as EnvService;
}

function buildFile(overrides: Partial<Express.Multer.File> = {}): Express.Multer.File {
  return {
    buffer: Buffer.from('data'),
    mimetype: 'image/png',
    size: 4,
    ...overrides,
  } as Express.Multer.File;
}

describe('validateImageFile', () => {
  it('returns the file when it is present, allowed, and within the size limit', () => {
    const file = buildFile();

    expect(validateImageFile(file, buildEnv())).toBe(file);
  });

  it('rejects a missing file', () => {
    expect(() => validateImageFile(undefined, buildEnv())).toThrow(BadRequestException);
  });

  it('rejects a MIME type outside the allowed set', () => {
    const file = buildFile({ mimetype: 'application/pdf' });

    expect(() => validateImageFile(file, buildEnv())).toThrow(UnsupportedMediaTypeException);
  });

  it('rejects a file larger than MAX_IMAGE_UPLOAD_SIZE_BYTES', () => {
    const file = buildFile({ size: 2048 });

    expect(() => validateImageFile(file, buildEnv(1024))).toThrow(PayloadTooLargeException);
  });
});
