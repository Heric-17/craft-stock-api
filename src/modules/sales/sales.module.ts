import { Module } from '@nestjs/common';

import { PrismaModule } from '../../shared/infrastructure/prisma/prisma.module';
import { UnitOfWorkModule } from '../../shared/infrastructure/persistence/unit-of-work.module';
import { CompositeProductsModule } from '../composite-products/composite-products.module';
import { MaterialsModule } from '../materials/materials.module';
import { SalesAnalyticsService } from './application/services/sales-analytics.service';
import { SalesService } from './application/services/sales.service';
import { SALES_ANALYTICS_PORT } from './domain/ports/sales-analytics.port';
import { SALE_REPOSITORY } from './domain/repositories/sale.repository';
import { PrismaSalesAnalyticsAdapter } from './infrastructure/analytics/prisma-sales-analytics.adapter';
import { PrismaSaleRepository } from './infrastructure/persistence/prisma-sale.repository';
import { SalesController } from './presentation/sales.controller';

@Module({
  imports: [PrismaModule, UnitOfWorkModule, MaterialsModule, CompositeProductsModule],
  controllers: [SalesController],
  providers: [
    { provide: SALE_REPOSITORY, useClass: PrismaSaleRepository },
    { provide: SALES_ANALYTICS_PORT, useClass: PrismaSalesAnalyticsAdapter },
    SalesAnalyticsService,
    SalesService,
  ],
  exports: [SALE_REPOSITORY],
})
export class SalesModule {}
