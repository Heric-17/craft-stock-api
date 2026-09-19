import { Module } from '@nestjs/common';

import { PrismaModule } from '../../shared/infrastructure/prisma/prisma.module';
import { PENDING_INVOICE_REPOSITORY } from './domain/repositories/pending-invoice.repository';
import { PrismaPendingInvoiceRepository } from './infrastructure/persistence/prisma-pending-invoice.repository';

@Module({
  imports: [PrismaModule],
  providers: [{ provide: PENDING_INVOICE_REPOSITORY, useClass: PrismaPendingInvoiceRepository }],
  exports: [PENDING_INVOICE_REPOSITORY],
})
export class InvoicesModule {}
