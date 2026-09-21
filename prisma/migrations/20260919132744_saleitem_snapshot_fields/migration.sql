-- `unitPrice` already held exactly that value (set once at creation, never
-- updated by any code path) — it is renamed in place so existing data is
-- preserved exactly, not approximated.
ALTER TABLE "SaleItem" RENAME COLUMN "unitPrice" TO "unitPriceSnapshot";

-- `itemNameSnapshot` is a new concept: no historical name was ever captured
-- before this migration. Added nullable first so existing rows can be
-- backfilled.
ALTER TABLE "SaleItem" ADD COLUMN "itemNameSnapshot" TEXT;

-- Retroactive approximation for rows that predate this migration: backfills
-- itemNameSnapshot from the CURRENT name of the referenced CompositeProduct
-- or Material, since the actual name at sale time was never recorded. This
-- is best-effort, not a real historical value — any CompositeProduct/Material
-- renamed since the sale will backfill with the wrong (current) name.
UPDATE "SaleItem" AS si
SET "itemNameSnapshot" = COALESCE(cp.name, m.name)
FROM "SaleItem" AS si2
LEFT JOIN "CompositeProduct" AS cp ON cp.id = si2."compositeProductId"
LEFT JOIN "Material" AS m ON m.id = si2."materialId"
WHERE si.id = si2.id;

-- Now that every row has a value, enforce the same NOT NULL the domain
-- entity requires going forward.
ALTER TABLE "SaleItem" ALTER COLUMN "itemNameSnapshot" SET NOT NULL;
