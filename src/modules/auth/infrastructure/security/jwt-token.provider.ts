import { Injectable } from '@nestjs/common';
import { sign as signToken, verify as verifyToken, type JwtPayload } from 'jsonwebtoken';

import { EnvService } from '../../../../config/env.service';
import { InvalidTokenError } from '../../domain/auth.error';
import type {
  AuthTokenPayload,
  SignedToken,
  TokenProvider,
} from '../../domain/ports/token-provider.port';

@Injectable()
export class JwtTokenProvider implements TokenProvider {
  private readonly secret: string;
  private readonly expiresInSeconds: number;

  constructor(env: EnvService) {
    this.secret = env.get('JWT_SECRET');
    this.expiresInSeconds = env.get('JWT_EXPIRES_IN_SECONDS');
  }

  sign(payload: AuthTokenPayload): SignedToken {
    const accessToken = signToken(payload, this.secret, { expiresIn: this.expiresInSeconds });
    return { accessToken, expiresInSeconds: this.expiresInSeconds };
  }

  verify(token: string): AuthTokenPayload {
    let decoded: JwtPayload | string;

    try {
      decoded = verifyToken(token, this.secret);
    } catch {
      throw new InvalidTokenError('Token is invalid or expired.');
    }

    const sub = typeof decoded === 'object' ? decoded.sub : undefined;
    const email: unknown = typeof decoded === 'object' ? decoded.email : undefined;

    if (typeof sub !== 'string' || typeof email !== 'string') {
      throw new InvalidTokenError('Token payload is malformed.');
    }

    return { sub, email };
  }
}
