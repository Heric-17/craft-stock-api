import { Module } from '@nestjs/common';

import { UNIT_OF_WORK } from '../../domain/persistence/unit-of-work';
import { PrismaModule } from '../prisma/prisma.module';
import { PrismaUnitOfWork } from './prisma-unit-of-work';

@Module({
  imports: [PrismaModule],
  providers: [{ provide: UNIT_OF_WORK, useClass: PrismaUnitOfWork }],
  exports: [UNIT_OF_WORK],
})
export class UnitOfWorkModule {}
