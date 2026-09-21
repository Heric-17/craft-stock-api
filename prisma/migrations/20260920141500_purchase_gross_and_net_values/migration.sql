-- A purchase answers two different questions with two different numbers: what
-- it costs to REPLACE an item (the gross line value, which feeds packageCost)
-- and what the company actually PAID (the net value, which feeds the spending
-- panel). Before this migration only one number existed per line, so the
-- second question could not be answered without reprocessing rawInvoiceData.

-- Added nullable first: existing rows have no gross/net split to copy from.
ALTER TABLE "PurchaseItem" ADD COLUMN "grossValue" DECIMAL(12,2);
ALTER TABLE "PurchaseItem" ADD COLUMN "netValue" DECIMAL(12,2);

-- Retroactive reconstruction for rows that predate this migration: the
-- invoice's own line total was never captured, so the only gross figure
-- available is quantity × unitPrice.
UPDATE "PurchaseItem"
SET "grossValue" = ROUND("quantity" * "unitPrice", 2)
WHERE "grossValue" IS NULL;

-- No discount was ever recorded before this migration, on the note or on the
-- line. With nothing to apportion, the net side of an existing line is its
-- gross side — not an approximation, the apportioning factor is exactly 1.
UPDATE "PurchaseItem"
SET "netValue" = "grossValue"
WHERE "netValue" IS NULL;

ALTER TABLE "PurchaseItem" ALTER COLUMN "grossValue" SET NOT NULL;
ALTER TABLE "PurchaseItem" ALTER COLUMN "netValue" SET NOT NULL;

ALTER TABLE "Purchase" ADD COLUMN "grossTotal" DECIMAL(12,2);
ALTER TABLE "Purchase" ADD COLUMN "discountTotal" DECIMAL(12,2);
ALTER TABLE "Purchase" ADD COLUMN "netTotal" DECIMAL(12,2);

-- Going forward these three are header values captured from the invoice. For
-- rows that predate this migration no header was kept, so grossTotal is
-- reconstructed from the lines just backfilled, and a purchase with no lines
-- reconstructs to zero.
UPDATE "Purchase" AS p
SET "grossTotal" = COALESCE(
  (SELECT SUM(i."grossValue") FROM "PurchaseItem" AS i WHERE i."purchaseId" = p."id"),
  0
)
WHERE p."grossTotal" IS NULL;

UPDATE "Purchase" SET "discountTotal" = 0 WHERE "discountTotal" IS NULL;
UPDATE "Purchase" SET "netTotal" = "grossTotal" WHERE "netTotal" IS NULL;

ALTER TABLE "Purchase" ALTER COLUMN "grossTotal" SET NOT NULL;
ALTER TABLE "Purchase" ALTER COLUMN "discountTotal" SET NOT NULL;
ALTER TABLE "Purchase" ALTER COLUMN "netTotal" SET NOT NULL;

-- The spending dataset scans purchases by date over a closed period.
CREATE INDEX "Purchase_purchaseDate_idx" ON "Purchase"("purchaseDate");
