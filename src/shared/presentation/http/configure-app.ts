import { resolve } from 'node:path';

import cookieParser from 'cookie-parser';
import type { NestExpressApplication } from '@nestjs/platform-express';

import type { EnvService } from '../../../config/env.service';
import {
  IMAGE_CACHE_MAX_AGE_SECONDS,
  UPLOADS_PUBLIC_PATH,
} from '../../domain/storage/image-delivery';
import { CORRELATION_ID_HEADER } from '../middleware/request-context.middleware';
import { resolveCorsOrigins } from './cors-origins';

const ALLOWED_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'];

const ALLOWED_HEADERS = ['Content-Type', 'Authorization', CORRELATION_ID_HEADER];

const PREFLIGHT_MAX_AGE_SECONDS = 86_400;

export function configureApp(app: NestExpressApplication, env: EnvService): void {
  app.use(cookieParser());

  app.enableCors({
    origin: resolveCorsOrigins(env.get('CORS_ORIGINS'), env.isProduction),
    credentials: true,
    methods: ALLOWED_METHODS,
    allowedHeaders: ALLOWED_HEADERS,
    exposedHeaders: [CORRELATION_ID_HEADER],
    maxAge: PREFLIGHT_MAX_AGE_SECONDS,
  });

  app.useStaticAssets(resolve(env.get('UPLOADS_DIR')), {
    prefix: UPLOADS_PUBLIC_PATH,
    maxAge: IMAGE_CACHE_MAX_AGE_SECONDS * 1_000,
    immutable: true,
  });
}
