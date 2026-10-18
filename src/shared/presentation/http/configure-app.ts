import { resolve } from 'node:path';

import cookieParser from 'cookie-parser';
import type { NestExpressApplication } from '@nestjs/platform-express';

import type { EnvService } from '../../../config/env.service';
import {
  IMAGE_CACHE_MAX_AGE_SECONDS,
  UPLOADS_PUBLIC_PATH,
} from '../../domain/storage/image-delivery';
import { CORRELATION_ID_HEADER } from '../middleware/request-context.middleware';
import { API_GLOBAL_PREFIX, UNPREFIXED_ROUTES } from './api-prefix';
import { resolveCorsOrigins } from './cors-origins';

const ALLOWED_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'];

const ALLOWED_HEADERS = ['Content-Type', 'Authorization', CORRELATION_ID_HEADER];

const PREFLIGHT_MAX_AGE_SECONDS = 86_400;

export function configureApp(app: NestExpressApplication, env: EnvService): void {
  // Before anything reads `request.ip`, which the rate limit counts clients
  // by. Behind a reverse proxy the socket address is the proxy's own, so the
  // real one is taken from `X-Forwarded-For`, walking it from the right past
  // the entries that are our own proxies, by count or by address: whatever
  // stands to the left of the first entry nobody vouches for was written by
  // the client and can say anything. Zero (and the development fallback) means
  // no proxy: the header is ignored outright.
  app.set('trust proxy', env.get('TRUST_PROXY') ?? 0);

  app.use(cookieParser());

  if (API_GLOBAL_PREFIX.length > 0) {
    app.setGlobalPrefix(API_GLOBAL_PREFIX, { exclude: [...UNPREFIXED_ROUTES] });
  }

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
