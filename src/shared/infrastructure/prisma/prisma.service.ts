import { Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';

import { EnvService } from '../../../config/env.service';
import { StructuredLogger } from '../logging/structured-logger.service';
import { PrismaClient } from './generated/client';

/**
 * The only place in the application that owns a `PrismaClient`. Repositories
 * live in `infrastructure/` and depend on this; nothing else does.
 *
 * Since Prisma 7 the client no longer reads the connection URL from the schema:
 * it receives a driver adapter. The adapter is built here, in the constructor,
 * rather than in a factory provider — factories must not instantiate with `new`,
 * and an adapter is infrastructure plumbing, not one of several implementations
 * of a domain contract to select between.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor(
    env: EnvService,
    private readonly logger: StructuredLogger,
  ) {
    super({
      adapter: new PrismaPg({ connectionString: env.get('DATABASE_URL') }),
      errorFormat: env.isProduction ? 'minimal' : 'pretty',
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();

    // The pg driver adapter opens connections lazily, so `$connect()` alone
    // resolves even when there is no database listening. One trivial round trip
    // turns it into a real check: the application must refuse to boot rather
    // than come up degraded and fail on the first request.
    await this.$queryRaw`SELECT 1`;

    this.logger.log('Database connection established', PrismaService.name);
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
    this.logger.log('Database connection closed', PrismaService.name);
  }
}
