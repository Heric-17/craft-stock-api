import { Module } from '@nestjs/common';

import { PrismaModule } from '../../shared/infrastructure/prisma/prisma.module';
import { PURCHASE_REPOSITORY } from './domain/repositories/purchase.repository';
import { PrismaPurchaseRepository } from './infrastructure/persistence/prisma-purchase.repository';

@Module({
  imports: [PrismaModule],
  providers: [{ provide: PURCHASE_REPOSITORY, useClass: PrismaPurchaseRepository }],
  exports: [PURCHASE_REPOSITORY],
})
export class PurchasesModule {}
