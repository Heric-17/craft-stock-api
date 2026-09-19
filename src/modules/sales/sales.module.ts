import { Module } from '@nestjs/common';

import { PrismaModule } from '../../shared/infrastructure/prisma/prisma.module';
import { UnitOfWorkModule } from '../../shared/infrastructure/persistence/unit-of-work.module';
import { CompositeProductsModule } from '../composite-products/composite-products.module';
import { MaterialsModule } from '../materials/materials.module';
import { SalesService } from './application/services/sales.service';
import { SALE_REPOSITORY } from './domain/repositories/sale.repository';
import { PrismaSaleRepository } from './infrastructure/persistence/prisma-sale.repository';
import { SalesController } from './presentation/sales.controller';

@Module({
  imports: [PrismaModule, UnitOfWorkModule, MaterialsModule, CompositeProductsModule],
  controllers: [SalesController],
  providers: [{ provide: SALE_REPOSITORY, useClass: PrismaSaleRepository }, SalesService],
  exports: [SALE_REPOSITORY],
})
export class SalesModule {}
