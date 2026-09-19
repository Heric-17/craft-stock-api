import { Module, ValidationPipe, type MiddlewareConsumer, type NestModule } from '@nestjs/common';
import { APP_FILTER, APP_PIPE } from '@nestjs/core';

import { EnvModule } from './config/env.module';
import { CompositeProductsModule } from './modules/composite-products/composite-products.module';
import { HealthModule } from './modules/health/health.module';
import { InvoicesModule } from './modules/invoices/invoices.module';
import { MaterialsModule } from './modules/materials/materials.module';
import { PurchasesModule } from './modules/purchases/purchases.module';
import { SalesModule } from './modules/sales/sales.module';
import { UsersModule } from './modules/users/users.module';
import { AllExceptionsFilter } from './shared/presentation/filters/all-exceptions.filter';
import { CorrelationIdMiddleware } from './shared/presentation/middleware/correlation-id.middleware';
import { LoggingModule } from './shared/infrastructure/logging/logging.module';
import { PrismaModule } from './shared/infrastructure/prisma/prisma.module';
import { UnitOfWorkModule } from './shared/infrastructure/persistence/unit-of-work.module';

@Module({
  imports: [
    EnvModule,
    LoggingModule,
    PrismaModule,
    UnitOfWorkModule,
    MaterialsModule,
    CompositeProductsModule,
    SalesModule,
    PurchasesModule,
    InvoicesModule,
    UsersModule,
    HealthModule,
  ],
  providers: [
    CorrelationIdMiddleware,
    {
      // Unknown properties are rejected instead of silently dropped, and the
      // payload arrives at the controller already as the DTO class.
      provide: APP_PIPE,
      useValue: new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: false },
      }),
    },
    {
      provide: APP_FILTER,
      useClass: AllExceptionsFilter,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(CorrelationIdMiddleware).forRoutes('*');
  }
}
