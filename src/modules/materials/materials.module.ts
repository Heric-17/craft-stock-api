import { Module } from '@nestjs/common';

import { EnvModule } from '../../config/env.module';
import { PrismaModule } from '../../shared/infrastructure/prisma/prisma.module';
import { StorageModule } from '../../shared/infrastructure/storage/storage.module';
import { UnitOfWorkModule } from '../../shared/infrastructure/persistence/unit-of-work.module';
import { MaterialInventoryService } from './application/services/material-inventory.service';
import { MaterialsService } from './application/services/materials.service';
import { StockLossesService } from './application/services/stock-losses.service';
import { MATERIAL_INVENTORY_SUMMARY_PORT } from './domain/ports/material-inventory-summary.port';
import { STOCK_LOSS_DATASET_PORT } from './domain/ports/stock-loss-dataset.port';
import { MATERIAL_REPOSITORY } from './domain/repositories/material.repository';
import { STOCK_LOSS_REPOSITORY } from './domain/repositories/stock-loss.repository';
import { PrismaMaterialInventorySummaryAdapter } from './infrastructure/analytics/prisma-material-inventory-summary.adapter';
import { PrismaStockLossDatasetAdapter } from './infrastructure/analytics/prisma-stock-loss-dataset.adapter';
import { PrismaMaterialRepository } from './infrastructure/persistence/prisma-material.repository';
import { PrismaStockLossRepository } from './infrastructure/persistence/prisma-stock-loss.repository';
import { MaterialsController } from './presentation/materials.controller';

@Module({
  imports: [PrismaModule, UnitOfWorkModule, StorageModule, EnvModule],
  controllers: [MaterialsController],
  providers: [
    { provide: MATERIAL_REPOSITORY, useClass: PrismaMaterialRepository },
    { provide: STOCK_LOSS_REPOSITORY, useClass: PrismaStockLossRepository },
    { provide: STOCK_LOSS_DATASET_PORT, useClass: PrismaStockLossDatasetAdapter },
    { provide: MATERIAL_INVENTORY_SUMMARY_PORT, useClass: PrismaMaterialInventorySummaryAdapter },
    MaterialInventoryService,
    MaterialsService,
    StockLossesService,
  ],
  exports: [MATERIAL_REPOSITORY],
})
export class MaterialsModule {}
