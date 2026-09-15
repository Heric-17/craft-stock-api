import { Module, ValidationPipe, type MiddlewareConsumer, type NestModule } from '@nestjs/common';
import { APP_FILTER, APP_PIPE } from '@nestjs/core';

import { EnvModule } from './config/env.module';
import { HealthModule } from './modules/health/health.module';
import { AllExceptionsFilter } from './shared/presentation/filters/all-exceptions.filter';
import { CorrelationIdMiddleware } from './shared/presentation/middleware/correlation-id.middleware';
import { LoggingModule } from './shared/infrastructure/logging/logging.module';
import { PrismaModule } from './shared/infrastructure/prisma/prisma.module';

@Module({
  imports: [EnvModule, LoggingModule, PrismaModule, HealthModule],
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
