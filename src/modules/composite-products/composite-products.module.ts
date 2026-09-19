import { Module } from '@nestjs/common';

import { PrismaModule } from '../../shared/infrastructure/prisma/prisma.module';
import { UnitOfWorkModule } from '../../shared/infrastructure/persistence/unit-of-work.module';
import { MaterialsModule } from '../materials/materials.module';
import { CompositeProductsService } from './application/services/composite-products.service';
import { COMPOSITE_PRODUCT_REPOSITORY } from './domain/repositories/composite-product.repository';
import { PrismaCompositeProductRepository } from './infrastructure/persistence/prisma-composite-product.repository';
import { CompositeProductsController } from './presentation/composite-products.controller';

@Module({
  imports: [PrismaModule, UnitOfWorkModule, MaterialsModule],
  controllers: [CompositeProductsController],
  providers: [
    { provide: COMPOSITE_PRODUCT_REPOSITORY, useClass: PrismaCompositeProductRepository },
    CompositeProductsService,
  ],
  exports: [COMPOSITE_PRODUCT_REPOSITORY],
})
export class CompositeProductsModule {}
