import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { TestingModule } from '@nestjs/testing';

import { EnvService } from '../../src/config/env.service';
import { configureApp } from '../../src/shared/presentation/http/configure-app';

/**
 * Applies the production HTTP edge — route prefix, cookie parsing, CORS, the
 * static image mount — to an application built by `createNestApplication()`.
 *
 * Every e2e spec calls this right after creating the app, even the ones that
 * never touch a cookie or a cross-origin request. The point is that there is
 * no second configuration to keep in step: a spec that skipped it would be
 * exercising a different application from the one `main.ts` boots, and the
 * difference would surface first in production.
 */
export function configureTestApp(app: INestApplication, moduleRef: TestingModule): void {
  configureApp(app as NestExpressApplication, moduleRef.get(EnvService));
}
