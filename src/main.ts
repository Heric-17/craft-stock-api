import 'dotenv/config';

import type { NestExpressApplication } from '@nestjs/platform-express';
import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';
import { EnvService } from './config/env.service';
import { StructuredLogger } from './shared/infrastructure/logging/structured-logger.service';
import { configureApp } from './shared/presentation/http/configure-app';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });

  const logger = app.get(StructuredLogger);
  app.useLogger(logger);
  app.enableShutdownHooks();

  const env = app.get(EnvService);
  const port = env.get('PORT');

  configureApp(app, env);

  await app.listen(port);

  logger.log(`CraftStock API listening on port ${port} [${env.get('NODE_ENV')}]`, 'Bootstrap');
}

void bootstrap();
