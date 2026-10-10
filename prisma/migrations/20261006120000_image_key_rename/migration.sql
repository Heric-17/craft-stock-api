-- Renames the image column to say what it holds: a storage key (a UUID plus
-- an extension), not a URL. The URL is derived on read from the key and the
-- installation's public base, and is never persisted.
--
-- A rename is not additive, which this project otherwise prefers. It is
-- acceptable here because the installation is a single container with no
-- replicas, and the entrypoint applies migrations before the new code starts
-- serving: there is no window in which the old code sees the new column.
ALTER TABLE "Material" RENAME COLUMN "imageUrl" TO "imageKey";
ALTER TABLE "CompositeProduct" RENAME COLUMN "imageUrl" TO "imageKey";
