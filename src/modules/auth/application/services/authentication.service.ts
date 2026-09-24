import { randomBytes, randomUUID } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';

import { EnvService } from '../../../../config/env.service';
import {
  UNIT_OF_WORK,
  type RepositoryContext,
  type UnitOfWork,
} from '../../../../shared/domain/persistence/unit-of-work';
import {
  PASSWORD_HASHER,
  type PasswordHasher,
} from '../../../../shared/domain/security/password-hasher.port';
import { InvalidCredentialsError, InvalidRefreshTokenError } from '../../domain/auth.error';
import { TOKEN_PROVIDER, type TokenProvider } from '../../domain/ports/token-provider.port';
import { hashRefreshToken } from '../../domain/refresh-token-hash';
import { RefreshToken } from '../../domain/refresh-token.entity';
import type { LoginInput, LoginResult } from '../dto/auth.dto';

/**
 * `User` belongs to the `users` module, not this one. Reaching it through
 * `UnitOfWork.runInTransaction` — the same door every cross-module read in
 * this codebase uses (see `InvoiceClassificationService`) — means this
 * service never imports `UsersModule` directly.
 */
@Injectable()
export class AuthenticationService {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: UnitOfWork,
    @Inject(PASSWORD_HASHER) private readonly passwordHasher: PasswordHasher,
    @Inject(TOKEN_PROVIDER) private readonly tokenProvider: TokenProvider,
    private readonly env: EnvService,
  ) {}

  async login(input: LoginInput): Promise<LoginResult> {
    return this.unitOfWork.runInTransaction(async (ctx) => {
      const user = await ctx.users.findByEmail(input.email);

      if (user === null) {
        throw new InvalidCredentialsError('Email or password is incorrect.');
      }

      const passwordMatches = await this.passwordHasher.verify(user.passwordHash, input.password);

      if (!passwordMatches) {
        throw new InvalidCredentialsError('Email or password is incorrect.');
      }

      return this.issueSession(ctx, user.id, user.email);
    });
  }

  /**
   * Trades a still-valid refresh token for a new access token and a new
   * refresh token, and revokes the one presented — rotation, so a stolen
   * token that gets used first locks out the legitimate client on its next
   * attempt instead of both sides quietly sharing one long-lived secret.
   */
  async refresh(rawRefreshToken: string): Promise<LoginResult> {
    return this.unitOfWork.runInTransaction(async (ctx) => {
      const now = new Date();
      const existing = await ctx.refreshTokens.findByTokenHash(hashRefreshToken(rawRefreshToken));

      if (existing === null || !existing.isActive(now)) {
        throw new InvalidRefreshTokenError('Refresh token is invalid, expired, or already used.');
      }

      await ctx.refreshTokens.save(existing.revoke(now));

      const user = await ctx.users.findById(existing.userId);

      if (user === null) {
        throw new InvalidRefreshTokenError('Refresh token is invalid, expired, or already used.');
      }

      return this.issueSession(ctx, user.id, user.email);
    });
  }

  /** Idempotent: a token that is already gone or revoked is treated as success. */
  async logout(rawRefreshToken: string): Promise<void> {
    await this.unitOfWork.runInTransaction(async (ctx) => {
      const now = new Date();
      const existing = await ctx.refreshTokens.findByTokenHash(hashRefreshToken(rawRefreshToken));

      if (existing !== null && existing.isActive(now)) {
        await ctx.refreshTokens.save(existing.revoke(now));
      }
    });
  }

  private async issueSession(
    ctx: RepositoryContext,
    userId: string,
    email: string,
  ): Promise<LoginResult> {
    const { accessToken, expiresInSeconds } = this.tokenProvider.sign({ sub: userId, email });

    const now = new Date();
    const rawRefreshToken = randomBytes(32).toString('hex');
    const refreshTokenTtlSeconds = this.env.get('REFRESH_TOKEN_EXPIRES_IN_SECONDS');

    const refreshToken = new RefreshToken({
      id: randomUUID(),
      userId,
      tokenHash: hashRefreshToken(rawRefreshToken),
      expiresAt: new Date(now.getTime() + refreshTokenTtlSeconds * 1000),
      revokedAt: null,
      createdAt: now,
    });

    await ctx.refreshTokens.save(refreshToken);

    return { accessToken, tokenType: 'Bearer', expiresInSeconds, refreshToken: rawRefreshToken };
  }
}
