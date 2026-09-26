import { resolve } from 'node:path';

import type { NestExpressApplication } from '@nestjs/platform-express';
import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';
import { EnvService } from './config/env.service';
import { StructuredLogger } from './shared/infrastructure/logging/structured-logger.service';

async function bootstrap(): Promise<void> {
  // Buffered so the startup logs are emitted through the structured logger too,
  // instead of the default console logger.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });

  const logger = app.get(StructuredLogger);
  app.useLogger(logger);
  app.enableShutdownHooks();

  const env = app.get(EnvService);
  const port = env.get('PORT');

  // Only makes uploaded images reachable when STORAGE_PROVIDER is
  // LOCAL_DISK; harmless otherwise, since nothing writes under UPLOADS_DIR
  // when S3 is selected.
  app.useStaticAssets(resolve(env.get('UPLOADS_DIR')), { prefix: '/uploads' });

  await app.listen(port);

  logger.log(`CraftStock API listening on port ${port} [${env.get('NODE_ENV')}]`, 'Bootstrap');
}

void bootstrap();
