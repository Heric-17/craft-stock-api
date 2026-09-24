import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

/** What the guard attaches to the request once a bearer token verifies. */
export interface AuthenticatedRequestUser {
  id: string;
  email: string;
}

declare global {
  // `declare global` augmentation of an ambient namespace has no ES-module
  // equivalent — this is the standard, required shape for adding `user` to
  // Express's own `Request` type.
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthenticatedRequestUser;
    }
  }
}

/**
 * Reads the authenticated principal the global guard attached to the
 * request. Only usable on a route the guard actually ran on — never on one
 * marked `@Public()`.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedRequestUser => {
    const request = context.switchToHttp().getRequest<Request>();

    if (!request.user) {
      throw new Error('CurrentUser was used on a route the authentication guard did not run on.');
    }

    return request.user;
  },
);
