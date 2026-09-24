import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';

import { HttpStatus } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import request from 'supertest';

import type { LoginResult } from '../../src/modules/auth/application/dto/auth.dto';
import { UsersService } from '../../src/modules/users/application/services/users.service';

export interface AuthenticatedActor {
  /** Ready for `.set('Authorization', authHeader)`. */
  authHeader: string;
  /** So the caller can delete it in `afterAll` — this helper does not track its own cleanup. */
  userId: string;
}

/**
 * Creates a throwaway user directly through `UsersService` — bypassing HTTP,
 * since `POST /users` itself now requires a token like every other business
 * route — then logs in over HTTP to get a real, guard-verifiable bearer
 * token. Every e2e spec that drives a business route over HTTP needs this
 * now that the guard is global.
 */
export async function authenticate(
  moduleRef: TestingModule,
  server: Server,
): Promise<AuthenticatedActor> {
  const email = `e2e-${randomUUID()}@craftstock.dev`;
  const password = 'correct horse battery staple';

  const user = await moduleRef
    .get(UsersService)
    .register({ email, password, name: 'E2E Test User' });

  const response = await request(server)
    .post('/auth/login')
    .send({ email, password })
    .expect(HttpStatus.OK);

  const body = response.body as LoginResult;
  return { authHeader: `Bearer ${body.accessToken}`, userId: user.id };
}
