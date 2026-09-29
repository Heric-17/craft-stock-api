-- AlterTable
ALTER TABLE "RequestLog" ADD COLUMN     "errorContext" TEXT,
ADD COLUMN     "errorMessage" TEXT,
ADD COLUMN     "errorType" TEXT,
ADD COLUMN     "stackTrace" TEXT;

-- CreateIndex
CREATE INDEX "RequestLog_errorType_idx" ON "RequestLog"("errorType");
