-- Stock adjustments are reduced to what is used: losses. Losses that stand are
-- carried over; reversed losses (already cancelled, stock restored), entries,
-- count corrections and reversals are dropped with the old table.

-- CreateTable
CREATE TABLE "StockLoss" (
    "id" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL,
    "reason" "StockLossReason" NOT NULL,
    "observation" TEXT,
    "costBasisAmount" DECIMAL(12,2) NOT NULL,
    "costBasisQuantity" DECIMAL(12,3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockLoss_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StockLoss_materialId_idx" ON "StockLoss"("materialId");

-- CreateIndex
CREATE INDEX "StockLoss_createdAt_idx" ON "StockLoss"("createdAt");

-- AddForeignKey
ALTER TABLE "StockLoss" ADD CONSTRAINT "StockLoss_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Carry over the losses that were not reversed
INSERT INTO "StockLoss" ("id", "materialId", "quantity", "reason", "observation", "costBasisAmount", "costBasisQuantity", "createdAt")
SELECT a."id", a."materialId", -a."quantityDelta", a."reason", a."observation", a."costBasisAmount", a."costBasisQuantity", a."createdAt"
FROM "StockAdjustment" a
WHERE a."kind" = 'MANUAL_LOSS'
  AND NOT EXISTS (SELECT 1 FROM "StockAdjustment" r WHERE r."reversedAdjustmentId" = a."id");

-- DropTable
DROP TABLE "StockAdjustment";

-- DropEnum
DROP TYPE "StockAdjustmentKind";
