import { Module } from '@nestjs/common';

import { PrismaModule } from '../../shared/infrastructure/prisma/prisma.module';
import { SALE_REPOSITORY } from './domain/repositories/sale.repository';
import { PrismaSaleRepository } from './infrastructure/persistence/prisma-sale.repository';

@Module({
  imports: [PrismaModule],
  providers: [{ provide: SALE_REPOSITORY, useClass: PrismaSaleRepository }],
  exports: [SALE_REPOSITORY],
})
export class SalesModule {}
