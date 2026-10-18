import { randomBytes, randomUUID } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';

import { EnvService } from '../../../../config/env.service';
import {
  EMAIL_SENDER_FACTORY,
  type EmailSenderFactory,
} from '../../../../shared/domain/email/email-sender';
import { UNIT_OF_WORK, type UnitOfWork } from '../../../../shared/domain/persistence/unit-of-work';
import {
  PASSWORD_HASHER,
  type PasswordHasher,
} from '../../../../shared/domain/security/password-hasher.port';
import { StructuredLogger } from '../../../../shared/infrastructure/logging/structured-logger.service';
import type { User } from '../../../users/domain/user.entity';
import { UserNotFoundError } from '../../../users/domain/user.error';
import {
  InvalidCurrentPasswordError,
  InvalidPasswordResetTokenError,
} from '../../domain/auth.error';
import { hashPasswordResetToken } from '../../domain/password-reset-token-hash';
import {
  PASSWORD_RESET_COOLDOWN_MS,
  PASSWORD_RESET_TOKEN_TTL_MS,
  PasswordResetToken,
} from '../../domain/password-reset-token.entity';
import { hashRefreshToken } from '../../domain/refresh-token-hash';
import { buildPasswordResetLink, composePasswordResetEmail } from '../password-reset-email';
import type { ChangePasswordInput, ResetPasswordInput } from '../dto/auth.dto';

/**
 * Everything that sets a new password: the signed-in person changing theirs,
 * and the person who lost theirs asking for a link by e-mail.
 *
 * Whichever way the password changes, the sessions that existed before it are
 * closed. A password is changed either because it is no longer trusted or
 * because it was forgotten, and in both cases a session opened with the old
 * one is the thing that should not survive.
 */
@Injectable()
export class PasswordService {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: UnitOfWork,
    @Inject(PASSWORD_HASHER) private readonly passwordHasher: PasswordHasher,
    @Inject(EMAIL_SENDER_FACTORY) private readonly emailSenders: EmailSenderFactory,
    private readonly env: EnvService,
    private readonly logger: StructuredLogger,
  ) {}

  /**
   * The signed-in person changes their own password. The session they are
   * using stays open and every other one, on other devices, is closed.
   */
  async changePassword(input: ChangePasswordInput): Promise<void> {
    await this.unitOfWork.runInTransaction(async (ctx) => {
      const user = await ctx.users.findById(input.userId);

      if (user === null) {
        throw new UserNotFoundError(`User ${input.userId} was not found.`);
      }

      const matches = await this.passwordHasher.verify(user.passwordHash, input.currentPassword);

      if (!matches) {
        throw new InvalidCurrentPasswordError('The current password is incorrect.');
      }

      const now = new Date();
      const passwordHash = await this.passwordHasher.hash(input.newPassword);

      await ctx.users.save(user.changePassword(passwordHash, now));
      await ctx.refreshTokens.revokeActiveByUserId(
        user.id,
        now,
        input.currentRefreshToken === null
          ? undefined
          : hashRefreshToken(input.currentRefreshToken),
      );
      // A link asked for before the change must not be able to undo it.
      await ctx.passwordResetTokens.markAllUsedByUserId(user.id, now);
    });
  }

  /**
   * Sends a reset link to the address, if an account has it. Resolves the same
   * way whether or not one does: the caller learns nothing about which
   * addresses are registered.
   *
   * The e-mail is not awaited, for the same reason. A request that found an
   * account would otherwise take as long as the mail server, and an unknown
   * address would not — a difference anyone can time.
   */
  async requestReset(email: string): Promise<void> {
    const issued = await this.unitOfWork.runInTransaction(async (ctx) => {
      const user = await ctx.users.findByEmail(email);

      if (user === null) {
        return null;
      }

      const now = new Date();
      const latest = await ctx.passwordResetTokens.findLatestByUserId(user.id);

      if (
        latest !== null &&
        now.getTime() - latest.createdAt.getTime() < PASSWORD_RESET_COOLDOWN_MS
      ) {
        return null;
      }

      // Only the newest link works.
      await ctx.passwordResetTokens.markAllUsedByUserId(user.id, now);

      const rawToken = randomBytes(32).toString('hex');

      await ctx.passwordResetTokens.save(
        new PasswordResetToken({
          id: randomUUID(),
          userId: user.id,
          tokenHash: hashPasswordResetToken(rawToken),
          expiresAt: new Date(now.getTime() + PASSWORD_RESET_TOKEN_TTL_MS),
          usedAt: null,
          createdAt: now,
        }),
      );

      return { user, rawToken };
    });

    if (issued !== null) {
      void this.sendResetEmail(issued.user, issued.rawToken);
    }
  }

  /** Sets a new password from a reset link, and closes every session the account had. */
  async resetPassword(input: ResetPasswordInput): Promise<void> {
    await this.unitOfWork.runInTransaction(async (ctx) => {
      const now = new Date();
      const token = await ctx.passwordResetTokens.findByTokenHash(
        hashPasswordResetToken(input.token),
      );

      if (token === null || !token.isUsable(now)) {
        throw new InvalidPasswordResetTokenError(
          'Password reset token is invalid, expired, or already used.',
        );
      }

      const user = await ctx.users.findById(token.userId);

      if (user === null) {
        throw new InvalidPasswordResetTokenError(
          'Password reset token is invalid, expired, or already used.',
        );
      }

      const passwordHash = await this.passwordHasher.hash(input.newPassword);

      await ctx.users.save(user.changePassword(passwordHash, now));
      await ctx.passwordResetTokens.markAllUsedByUserId(user.id, now);
      await ctx.refreshTokens.revokeActiveByUserId(user.id, now);
    });
  }

  /** Never rejects: the request that triggered it has already been answered. */
  private async sendResetEmail(user: User, rawToken: string): Promise<void> {
    try {
      const link = buildPasswordResetLink(this.env.get('WEB_APP_URL'), rawToken);

      await this.emailSenders
        .create()
        .send(composePasswordResetEmail({ to: user.email, name: user.name, link }));
    } catch (error) {
      // Neither the link nor the token is in anything logged here.
      this.logger.error(
        `Failed to send the password reset e-mail to user ${user.id}`,
        error instanceof Error ? error.stack : undefined,
        PasswordService.name,
      );
    }
  }
}
