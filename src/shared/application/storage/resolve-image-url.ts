import type { StorageProvider } from '../../domain/storage/storage-provider';

export type ResolveImageUrl = (key: string | null) => string | null;

export function imageUrlResolver(storage: StorageProvider): ResolveImageUrl {
  return (key) => (key === null ? null : storage.publicUrl(key));
}
