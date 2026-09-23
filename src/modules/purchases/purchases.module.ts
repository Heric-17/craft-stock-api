import { Module } from '@nestjs/common';

import { PrismaModule } from '../../shared/infrastructure/prisma/prisma.module';
import { UnitOfWorkModule } from '../../shared/infrastructure/persistence/unit-of-work.module';
import { PurchaseAnalyticsService } from './application/services/purchase-analytics.service';
import { PurchaseEditingService } from './application/services/purchase-editing.service';
import { PurchasesService } from './application/services/purchases.service';
import { PURCHASE_ANALYTICS_PORT } from './domain/ports/purchase-analytics.port';
import { PURCHASE_REPOSITORY } from './domain/repositories/purchase.repository';
import { PrismaPurchaseAnalyticsAdapter } from './infrastructure/analytics/prisma-purchase-analytics.adapter';
import { PrismaPurchaseRepository } from './infrastructure/persistence/prisma-purchase.repository';
import { PurchasesController } from './presentation/purchases.controller';

@Module({
  imports: [PrismaModule, UnitOfWorkModule],
  controllers: [PurchasesController],
  providers: [
    { provide: PURCHASE_REPOSITORY, useClass: PrismaPurchaseRepository },
    { provide: PURCHASE_ANALYTICS_PORT, useClass: PrismaPurchaseAnalyticsAdapter },
    PurchaseAnalyticsService,
    PurchaseEditingService,
    PurchasesService,
  ],
  exports: [PURCHASE_REPOSITORY, PURCHASE_ANALYTICS_PORT, PurchasesService],
})
export class PurchasesModule {}
