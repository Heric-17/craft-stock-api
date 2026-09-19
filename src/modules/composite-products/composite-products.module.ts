import { Module } from '@nestjs/common';

import { PrismaModule } from '../../shared/infrastructure/prisma/prisma.module';
import { COMPOSITE_PRODUCT_REPOSITORY } from './domain/repositories/composite-product.repository';
import { PrismaCompositeProductRepository } from './infrastructure/persistence/prisma-composite-product.repository';

@Module({
  imports: [PrismaModule],
  providers: [
    { provide: COMPOSITE_PRODUCT_REPOSITORY, useClass: PrismaCompositeProductRepository },
  ],
  exports: [COMPOSITE_PRODUCT_REPOSITORY],
})
export class CompositeProductsModule {}
