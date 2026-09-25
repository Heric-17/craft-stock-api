import {
  Inject,
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';

import type { AuthenticatedRequestUser } from '../../../../shared/presentation/decorators/current-user.decorator';
import { IS_PUBLIC_KEY } from '../../../../shared/presentation/decorators/public.decorator';
import { RequestContextService } from '../../../../shared/infrastructure/logging/request-context.service';
import { TOKEN_PROVIDER, type TokenProvider } from '../../domain/ports/token-provider.port';

const BEARER_PREFIX = 'Bearer ';

/**
 * Registered globally in `AppModule`. Every route requires a valid bearer
 * token unless it carries `@Public()` — the only two exceptions today are
 * login/registration and the health check.
 *
 * Also the place `route`/`httpMethod` get filled into the request context
 * (§15.2's audit extension needs them and has no access to the HTTP
 * request): this runs for every route, public or not, and is the first point
 * in Nest's own pipeline where Express has already matched and dispatched to
 * the specific route, so `request.route` is reliably populated — unlike in
 * the middleware that opens the context, which runs before that dispatch.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly requestContext: RequestContextService,
    @Inject(TOKEN_PROVIDER) private readonly tokenProvider: TokenProvider,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    this.requestContext.setRoute(request.method, routePath(request));

    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const token = this.extractToken(request);

    if (token === null) {
      throw new UnauthorizedException('Missing bearer token.');
    }

    try {
      const payload = this.tokenProvider.verify(token);
      const user: AuthenticatedRequestUser = { id: payload.sub, email: payload.email };
      request.user = user;
      this.requestContext.setUserId(user.id);
      return true;
    } catch {
      // Whether the token is malformed, tampered with, or expired, the
      // caller sees the same 401 — the specifics live only in the log.
      throw new UnauthorizedException('Invalid or expired token.');
    }
  }

  private extractToken(request: Request): string | null {
    const header = request.headers.authorization;
    return header?.startsWith(BEARER_PREFIX) ? header.slice(BEARER_PREFIX.length) : null;
  }
}

/**
 * `Request.route` is typed loosely enough by `@types/express` that reading
 * `.path` off it directly resolves to `any`. Narrowed by hand here so this
 * stays a real type, not a silenced lint rule.
 */
function routePath(request: Request): string {
  const route = request.route as { path?: string } | undefined;
  return route?.path ?? request.originalUrl;
}
