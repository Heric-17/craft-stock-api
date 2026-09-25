import { Module, ValidationPipe, type MiddlewareConsumer, type NestModule } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_PIPE } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';

import { AuditLogModule } from './modules/audit-log/audit-log.module';
import { EnvModule } from './config/env.module';
import { AuthModule } from './modules/auth/auth.module';
import { JwtAuthGuard } from './modules/auth/presentation/guards/jwt-auth.guard';
import { CompositeProductsModule } from './modules/composite-products/composite-products.module';
import { HealthModule } from './modules/health/health.module';
import { InvoicesModule } from './modules/invoices/invoices.module';
import { MaterialsModule } from './modules/materials/materials.module';
import { PurchasesModule } from './modules/purchases/purchases.module';
import { SalesModule } from './modules/sales/sales.module';
import { UsersModule } from './modules/users/users.module';
import { AllExceptionsFilter } from './shared/presentation/filters/all-exceptions.filter';
import { RequestContextMiddleware } from './shared/presentation/middleware/request-context.middleware';
import { LoggingModule } from './shared/infrastructure/logging/logging.module';
import { PrismaModule } from './shared/infrastructure/prisma/prisma.module';
import { UnitOfWorkModule } from './shared/infrastructure/persistence/unit-of-work.module';

@Module({
  imports: [
    EnvModule,
    ScheduleModule.forRoot(),
    LoggingModule,
    PrismaModule,
    UnitOfWorkModule,
    AuthModule,
    MaterialsModule,
    CompositeProductsModule,
    SalesModule,
    PurchasesModule,
    InvoicesModule,
    UsersModule,
    AuditLogModule,
    HealthModule,
  ],
  providers: [
    RequestContextMiddleware,
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
    // Global: every route requires a bearer token unless it carries
    // `@Public()`. `useExisting` reuses the instance `AuthModule` already
    // builds rather than constructing a second one.
    {
      provide: APP_GUARD,
      useExisting: JwtAuthGuard,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestContextMiddleware).forRoutes('*');
  }
}
