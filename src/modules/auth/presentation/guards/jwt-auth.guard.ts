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
import { TOKEN_PROVIDER, type TokenProvider } from '../../domain/ports/token-provider.port';

const BEARER_PREFIX = 'Bearer ';

/**
 * Registered globally in `AppModule`. Every route requires a valid bearer
 * token unless it carries `@Public()` — the only two exceptions today are
 * login/registration and the health check.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(TOKEN_PROVIDER) private readonly tokenProvider: TokenProvider,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractToken(request);

    if (token === null) {
      throw new UnauthorizedException('Missing bearer token.');
    }

    try {
      const payload = this.tokenProvider.verify(token);
      const user: AuthenticatedRequestUser = { id: payload.sub, email: payload.email };
      request.user = user;
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
