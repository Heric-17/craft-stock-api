-- AlterTable
ALTER TABLE "Purchase" ADD COLUMN     "merchantCnpj" TEXT,
ADD COLUMN     "merchantName" TEXT;

-- CreateIndex
CREATE INDEX "Purchase_merchantCnpj_idx" ON "Purchase"("merchantCnpj");
