import { Module } from '@nestjs/common';

import { EnvModule } from '../../config/env.module';
import { PrismaModule } from '../../shared/infrastructure/prisma/prisma.module';
import { StorageModule } from '../../shared/infrastructure/storage/storage.module';
import { UnitOfWorkModule } from '../../shared/infrastructure/persistence/unit-of-work.module';
import { MaterialInventoryService } from './application/services/material-inventory.service';
import { MaterialsService } from './application/services/materials.service';
import { MATERIAL_INVENTORY_SUMMARY_PORT } from './domain/ports/material-inventory-summary.port';
import { MATERIAL_REPOSITORY } from './domain/repositories/material.repository';
import { PrismaMaterialInventorySummaryAdapter } from './infrastructure/analytics/prisma-material-inventory-summary.adapter';
import { PrismaMaterialRepository } from './infrastructure/persistence/prisma-material.repository';
import { MaterialsController } from './presentation/materials.controller';

@Module({
  imports: [PrismaModule, UnitOfWorkModule, StorageModule, EnvModule],
  controllers: [MaterialsController],
  providers: [
    { provide: MATERIAL_REPOSITORY, useClass: PrismaMaterialRepository },
    { provide: MATERIAL_INVENTORY_SUMMARY_PORT, useClass: PrismaMaterialInventorySummaryAdapter },
    MaterialInventoryService,
    MaterialsService,
  ],
  exports: [MATERIAL_REPOSITORY],
})
export class MaterialsModule {}
