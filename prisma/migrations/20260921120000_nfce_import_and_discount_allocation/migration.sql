-- NFC-e import: the discount the note grants is attributed to its lines by a
-- mode the user chooses, and the line stores the attributed discount rather
-- than the resulting net value.
--
-- netValue leaves as a column and comes back as a derivation: it is always
-- grossValue minus allocatedDiscount, so keeping it stored made it a third
-- number to hold in step with the other two. allocatedDiscount cannot be
-- derived in turn — under MANUAL it is what the user typed, and it follows
-- from nothing.

CREATE TYPE "DiscountAllocationMode" AS ENUM ('PROPORTIONAL', 'COMPANY_ONLY', 'PERSONAL_ONLY', 'MANUAL');

ALTER TABLE "Purchase"
  ADD COLUMN "discountAllocationMode" "DiscountAllocationMode" NOT NULL DEFAULT 'PROPORTIONAL',
  ADD COLUMN "allocationPending" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "PurchaseItem" ADD COLUMN "allocatedDiscount" DECIMAL(12,2);

-- Every existing line was written under the old proportional spread, where
-- the discount it absorbed is exactly the gap between the two stored sides.
-- This is a rewrite of the same fact, not a recomputation: no rounding is
-- redone, so the per-line sums keep closing against the note's discountTotal.
UPDATE "PurchaseItem" SET "allocatedDiscount" = "grossValue" - "netValue" WHERE "allocatedDiscount" IS NULL;

ALTER TABLE "PurchaseItem" ALTER COLUMN "allocatedDiscount" SET NOT NULL;
ALTER TABLE "PurchaseItem" ALTER COLUMN "allocatedDiscount" SET DEFAULT 0;
ALTER TABLE "PurchaseItem" DROP COLUMN "netValue";

-- The merchant's product code and the unit as the note printed it. The code
-- is what the several printed lines of a weighed item are folded together by;
-- the unit is for display beside the line and never feeds packageQuantity.
ALTER TABLE "PurchaseItem"
  ADD COLUMN "code" TEXT,
  ADD COLUMN "unit" TEXT;

-- A capture that has been imported points at the purchase it produced, so a
-- second scan of the same note can show the user that purchase instead of
-- creating another one. Restrict, like every other historical reference:
-- deleting a purchase must not quietly orphan or erase its capture.
ALTER TABLE "PendingInvoice"
  ADD COLUMN "purchaseId" TEXT,
  ADD COLUMN "lastError" TEXT;

ALTER TABLE "PendingInvoice"
  ADD CONSTRAINT "PendingInvoice_purchaseId_fkey"
  FOREIGN KEY ("purchaseId") REFERENCES "Purchase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
