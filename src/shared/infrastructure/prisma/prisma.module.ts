import { Module } from '@nestjs/common';

import { PrismaService } from './prisma.service';

/**
 * Infrastructure module that encapsulates database access. Only modules whose
 * `infrastructure/` layer implements a repository should import it.
 */
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
