-- Manual changes to a Material's stock, with a reason. Additive: a new table and two enums.

-- CreateEnum
CREATE TYPE "StockAdjustmentKind" AS ENUM ('MANUAL_ENTRY', 'MANUAL_LOSS', 'MANUAL_ADJUSTMENT', 'REVERSAL');

-- CreateEnum
CREATE TYPE "StockLossReason" AS ENUM ('BREAKAGE', 'EXPIRED', 'SPOILAGE', 'LOST', 'OTHER');

-- CreateTable
CREATE TABLE "StockAdjustment" (
    "id" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "kind" "StockAdjustmentKind" NOT NULL,
    "quantityDelta" DECIMAL(12,3) NOT NULL,
    "reason" "StockLossReason",
    "observation" TEXT,
    "costBasisAmount" DECIMAL(12,2) NOT NULL,
    "costBasisQuantity" DECIMAL(12,3) NOT NULL,
    "reversedAdjustmentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StockAdjustment_reversedAdjustmentId_key" ON "StockAdjustment"("reversedAdjustmentId");

-- CreateIndex
CREATE INDEX "StockAdjustment_materialId_idx" ON "StockAdjustment"("materialId");

-- CreateIndex
CREATE INDEX "StockAdjustment_kind_createdAt_idx" ON "StockAdjustment"("kind", "createdAt");

-- AddForeignKey
ALTER TABLE "StockAdjustment" ADD CONSTRAINT "StockAdjustment_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockAdjustment" ADD CONSTRAINT "StockAdjustment_reversedAdjustmentId_fkey" FOREIGN KEY ("reversedAdjustmentId") REFERENCES "StockAdjustment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
