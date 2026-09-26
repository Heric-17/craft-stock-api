import { randomUUID } from 'node:crypto';

import { extensionForImageMimeType } from '../../domain/storage/image-mime-type';

/**
 * The one place a storage key is generated, shared by every `StorageProvider`
 * so neither backend ever writes a file under the name the client sent.
 */
export function buildStorageKey(mimeType: string): string {
  return `${randomUUID()}.${extensionForImageMimeType(mimeType)}`;
}
