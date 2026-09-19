import { Module } from '@nestjs/common';

import { PrismaModule } from '../../shared/infrastructure/prisma/prisma.module';
import { MATERIAL_REPOSITORY } from './domain/repositories/material.repository';
import { PrismaMaterialRepository } from './infrastructure/persistence/prisma-material.repository';

@Module({
  imports: [PrismaModule],
  providers: [{ provide: MATERIAL_REPOSITORY, useClass: PrismaMaterialRepository }],
  exports: [MATERIAL_REPOSITORY],
})
export class MaterialsModule {}
