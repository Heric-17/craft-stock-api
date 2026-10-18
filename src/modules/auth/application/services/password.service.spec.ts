import type { Env } from '../../../../config/env.schema';
import type { EnvService } from '../../../../config/env.service';
import type {
  EmailMessage,
  EmailSender,
  EmailSenderFactory,
} from '../../../../shared/domain/email/email-sender';
import type { RepositoryContext } from '../../../../shared/domain/persistence/unit-of-work';
import { InMemoryUnitOfWork } from '../../../../shared/infrastructure/persistence/in-memory-unit-of-work';
import { Argon2PasswordHasher } from '../../../../shared/infrastructure/security/argon2-password-hasher';
import type { StructuredLogger } from '../../../../shared/infrastructure/logging/structured-logger.service';
import { InMemoryCompositeProductRepository } from '../../../composite-products/infrastructure/persistence/in-memory-composite-product.repository';
import { InMemoryPendingInvoiceRepository } from '../../../invoices/infrastructure/persistence/in-memory-pending-invoice.repository';
import { InMemoryMaterialRepository } from '../../../materials/infrastructure/persistence/in-memory-material.repository';
import { InMemoryStockLossRepository } from '../../../materials/infrastructure/persistence/in-memory-stock-loss.repository';
import { InMemoryPurchaseRepository } from '../../../purchases/infrastructure/persistence/in-memory-purchase.repository';
import { InMemorySaleRepository } from '../../../sales/infrastructure/persistence/in-memory-sale.repository';
import { User } from '../../../users/domain/user.entity';
import { InMemoryUserRepository } from '../../../users/infrastructure/persistence/in-memory-user.repository';
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
import { RefreshToken } from '../../domain/refresh-token.entity';
import { InMemoryPasswordResetTokenRepository } from '../../infrastructure/persistence/in-memory-password-reset-token.repository';
import { InMemoryRefreshTokenRepository } from '../../infrastructure/persistence/in-memory-refresh-token.repository';
import { PasswordService } from './password.service';

const OLD_PASSWORD = 'correct horse battery staple';
const NEW_PASSWORD = 'a brand new passphrase';

function buildEnv(): EnvService {
  const values: Partial<Env> = {
    ARGON2_TIME_COST: 2,
    WEB_APP_URL: 'https://app.empresa.com.br',
  };

  return { get: <K extends keyof Env>(key: K): Env[K] => values[key] as Env[K] } as EnvService;
}

class RecordingEmailSender implements EmailSender, EmailSenderFactory {
  readonly sent: EmailMessage[] = [];
  failWith: Error | null = null;

  send(message: EmailMessage): Promise<void> {
    if (this.failWith !== null) {
      return Promise.reject(this.failWith);
    }

    this.sent.push(message);
    return Promise.resolve();
  }

  create(): EmailSender {
    return this;
  }
}

/** The service does not await the mail, so a test lets it settle before looking. */
function settle(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

function refreshTokenFor(userId: string, id: string, raw: string): RefreshToken {
  const now = new Date();

  return new RefreshToken({
    id,
    userId,
    tokenHash: hashRefreshToken(raw),
    expiresAt: new Date(now.getTime() + 60_000),
    revokedAt: null,
    createdAt: now,
  });
}

async function build(): Promise<{
  service: PasswordService;
  hasher: Argon2PasswordHasher;
  users: InMemoryUserRepository;
  refreshTokens: InMemoryRefreshTokenRepository;
  resetTokens: InMemoryPasswordResetTokenRepository;
  mail: RecordingEmailSender;
  logger: { error: jest.Mock };
  user: User;
}> {
  const hasher = new Argon2PasswordHasher(buildEnv());
  const users = new InMemoryUserRepository();
  const refreshTokens = new InMemoryRefreshTokenRepository();
  const resetTokens = new InMemoryPasswordResetTokenRepository();
  const mail = new RecordingEmailSender();
  const logger = { error: jest.fn() };

  const now = new Date();
  const user = new User({
    id: 'user-1',
    email: 'ana@exemplo.com',
    passwordHash: await hasher.hash(OLD_PASSWORD),
    name: 'Ana',
    createdAt: now,
    updatedAt: now,
  });
  await users.save(user);

  const context: RepositoryContext = {
    materials: new InMemoryMaterialRepository(),
    compositeProducts: new InMemoryCompositeProductRepository(),
    sales: new InMemorySaleRepository(),
    purchases: new InMemoryPurchaseRepository(),
    pendingInvoices: new InMemoryPendingInvoiceRepository(),
    stockLosses: new InMemoryStockLossRepository(),
    users,
    refreshTokens,
    passwordResetTokens: resetTokens,
  };

  const service = new PasswordService(
    new InMemoryUnitOfWork(context),
    hasher,
    mail,
    buildEnv(),
    logger as unknown as StructuredLogger,
  );

  return { service, hasher, users, refreshTokens, resetTokens, mail, logger, user };
}

describe('PasswordService', () => {
  describe('changePassword', () => {
    it('stores a hash that accepts the new password and refuses the old one', async () => {
      const { service, hasher, users, user } = await build();

      await service.changePassword({
        userId: user.id,
        currentPassword: OLD_PASSWORD,
        newPassword: NEW_PASSWORD,
        currentRefreshToken: null,
      });

      const stored = await users.findById(user.id);
      expect(await hasher.verify(stored!.passwordHash, NEW_PASSWORD)).toBe(true);
      expect(await hasher.verify(stored!.passwordHash, OLD_PASSWORD)).toBe(false);
    });

    it('refuses a wrong current password and leaves everything as it was', async () => {
      const { service, hasher, users, refreshTokens, user } = await build();
      await refreshTokens.save(refreshTokenFor(user.id, 'rt-other', 'other-device'));

      await expect(
        service.changePassword({
          userId: user.id,
          currentPassword: 'not the password',
          newPassword: NEW_PASSWORD,
          currentRefreshToken: null,
        }),
      ).rejects.toThrow(InvalidCurrentPasswordError);

      const stored = await users.findById(user.id);
      expect(await hasher.verify(stored!.passwordHash, OLD_PASSWORD)).toBe(true);
      const other = await refreshTokens.findByTokenHash(hashRefreshToken('other-device'));
      expect(other!.revokedAt).toBeNull();
    });

    it('keeps the session making the request and closes every other one', async () => {
      const { service, refreshTokens, user } = await build();
      await refreshTokens.save(refreshTokenFor(user.id, 'rt-here', 'this-device'));
      await refreshTokens.save(refreshTokenFor(user.id, 'rt-phone', 'phone'));
      await refreshTokens.save(refreshTokenFor(user.id, 'rt-pc', 'computer'));

      await service.changePassword({
        userId: user.id,
        currentPassword: OLD_PASSWORD,
        newPassword: NEW_PASSWORD,
        currentRefreshToken: 'this-device',
      });

      const here = await refreshTokens.findByTokenHash(hashRefreshToken('this-device'));
      const phone = await refreshTokens.findByTokenHash(hashRefreshToken('phone'));
      const computer = await refreshTokens.findByTokenHash(hashRefreshToken('computer'));
      expect(here!.revokedAt).toBeNull();
      expect(phone!.revokedAt).not.toBeNull();
      expect(computer!.revokedAt).not.toBeNull();
    });

    it('closes every session when the request carried none', async () => {
      const { service, refreshTokens, user } = await build();
      await refreshTokens.save(refreshTokenFor(user.id, 'rt-1', 'one'));

      await service.changePassword({
        userId: user.id,
        currentPassword: OLD_PASSWORD,
        newPassword: NEW_PASSWORD,
        currentRefreshToken: null,
      });

      const one = await refreshTokens.findByTokenHash(hashRefreshToken('one'));
      expect(one!.revokedAt).not.toBeNull();
    });

    it('leaves another account sessions alone', async () => {
      const { service, refreshTokens, user } = await build();
      await refreshTokens.save(refreshTokenFor('someone-else', 'rt-x', 'stranger'));

      await service.changePassword({
        userId: user.id,
        currentPassword: OLD_PASSWORD,
        newPassword: NEW_PASSWORD,
        currentRefreshToken: null,
      });

      const stranger = await refreshTokens.findByTokenHash(hashRefreshToken('stranger'));
      expect(stranger!.revokedAt).toBeNull();
    });

    it('voids a reset link asked for before the change', async () => {
      const { service, resetTokens, user } = await build();
      await service.requestReset(user.email);
      expect(resetTokens.all()[0].usedAt).toBeNull();

      await service.changePassword({
        userId: user.id,
        currentPassword: OLD_PASSWORD,
        newPassword: NEW_PASSWORD,
        currentRefreshToken: null,
      });

      expect(resetTokens.all()[0].usedAt).not.toBeNull();
    });
  });

  describe('requestReset', () => {
    it('mails a link whose token is stored only as a hash', async () => {
      const { service, resetTokens, mail, user } = await build();

      await service.requestReset(user.email);
      await settle();

      expect(mail.sent).toHaveLength(1);
      expect(mail.sent[0].to).toBe(user.email);

      const raw = /#token=([0-9a-f]{64})/.exec(mail.sent[0].text)?.[1];
      expect(raw).toBeDefined();
      expect(mail.sent[0].text).toContain(
        `https://app.empresa.com.br/redefinir-senha#token=${raw}`,
      );

      const [stored] = resetTokens.all();
      expect(stored.tokenHash).toBe(hashPasswordResetToken(raw!));
      expect(stored.tokenHash).not.toContain(raw!);
      expect(stored.expiresAt.getTime() - stored.createdAt.getTime()).toBe(
        PASSWORD_RESET_TOKEN_TTL_MS,
      );
    });

    it('finds the account whatever the case the address was typed in', async () => {
      const { service, mail, user } = await build();

      await service.requestReset(user.email.toUpperCase());
      await settle();

      expect(mail.sent).toHaveLength(1);
    });

    it('resolves and sends nothing for an address that has no account', async () => {
      const { service, resetTokens, mail } = await build();

      await expect(service.requestReset('nobody@exemplo.com')).resolves.toBeUndefined();
      await settle();

      expect(mail.sent).toEqual([]);
      expect(resetTokens.all()).toEqual([]);
    });

    it('does not send a second mail inside the cooldown', async () => {
      const { service, resetTokens, mail, user } = await build();

      await service.requestReset(user.email);
      await service.requestReset(user.email);
      await settle();

      expect(mail.sent).toHaveLength(1);
      expect(resetTokens.all()).toHaveLength(1);
    });

    it('sends a new link after the cooldown, and the older one stops working', async () => {
      const { service, resetTokens, mail, user } = await build();
      const longAgo = new Date(Date.now() - PASSWORD_RESET_COOLDOWN_MS - 1000);
      await resetTokens.save(
        new PasswordResetToken({
          id: 'old',
          userId: user.id,
          tokenHash: hashPasswordResetToken('old-raw'),
          expiresAt: new Date(longAgo.getTime() + PASSWORD_RESET_TOKEN_TTL_MS),
          usedAt: null,
          createdAt: longAgo,
        }),
      );

      await service.requestReset(user.email);
      await settle();

      expect(mail.sent).toHaveLength(1);
      const old = await resetTokens.findByTokenHash(hashPasswordResetToken('old-raw'));
      expect(old!.usedAt).not.toBeNull();
    });

    it('still resolves when the mail cannot be sent, and logs it without the link', async () => {
      const { service, mail, logger, user } = await build();
      mail.failWith = new Error('SMTP unreachable');

      await expect(service.requestReset(user.email)).resolves.toBeUndefined();
      await settle();

      expect(logger.error).toHaveBeenCalledTimes(1);
      const logged = JSON.stringify(logger.error.mock.calls);
      expect(logged).not.toContain('#token=');
    });
  });

  describe('resetPassword', () => {
    async function requestAndReadToken(ctx: Awaited<ReturnType<typeof build>>): Promise<string> {
      await ctx.service.requestReset(ctx.user.email);
      await settle();
      return /#token=([0-9a-f]{64})/.exec(ctx.mail.sent.at(-1)!.text)![1];
    }

    it('sets the new password, spends the link and closes every session', async () => {
      const ctx = await build();
      const token = await requestAndReadToken(ctx);
      await ctx.refreshTokens.save(refreshTokenFor(ctx.user.id, 'rt-1', 'phone'));
      await ctx.refreshTokens.save(refreshTokenFor(ctx.user.id, 'rt-2', 'computer'));

      await ctx.service.resetPassword({ token, newPassword: NEW_PASSWORD });

      const stored = await ctx.users.findById(ctx.user.id);
      expect(await ctx.hasher.verify(stored!.passwordHash, NEW_PASSWORD)).toBe(true);
      expect(ctx.resetTokens.all().every((t) => t.usedAt !== null)).toBe(true);
      for (const raw of ['phone', 'computer']) {
        const session = await ctx.refreshTokens.findByTokenHash(hashRefreshToken(raw));
        expect(session!.revokedAt).not.toBeNull();
      }
    });

    it('refuses the same link a second time', async () => {
      const ctx = await build();
      const token = await requestAndReadToken(ctx);
      await ctx.service.resetPassword({ token, newPassword: NEW_PASSWORD });

      await expect(
        ctx.service.resetPassword({ token, newPassword: 'yet another passphrase' }),
      ).rejects.toThrow(InvalidPasswordResetTokenError);

      const stored = await ctx.users.findById(ctx.user.id);
      expect(await ctx.hasher.verify(stored!.passwordHash, NEW_PASSWORD)).toBe(true);
    });

    it('refuses a token nobody issued', async () => {
      const { service } = await build();

      await expect(
        service.resetPassword({ token: 'f'.repeat(64), newPassword: NEW_PASSWORD }),
      ).rejects.toThrow(InvalidPasswordResetTokenError);
    });

    it('refuses an expired link', async () => {
      const { service, resetTokens, user } = await build();
      const created = new Date(Date.now() - PASSWORD_RESET_TOKEN_TTL_MS - 60_000);
      await resetTokens.save(
        new PasswordResetToken({
          id: 'expired',
          userId: user.id,
          tokenHash: hashPasswordResetToken('expired-raw'),
          expiresAt: new Date(created.getTime() + PASSWORD_RESET_TOKEN_TTL_MS),
          usedAt: null,
          createdAt: created,
        }),
      );

      await expect(
        service.resetPassword({ token: 'expired-raw', newPassword: NEW_PASSWORD }),
      ).rejects.toThrow(InvalidPasswordResetTokenError);
    });

    it('refuses a link whose account no longer exists', async () => {
      const { service, resetTokens } = await build();
      const now = new Date();
      await resetTokens.save(
        new PasswordResetToken({
          id: 'orphan',
          userId: 'deleted-user',
          tokenHash: hashPasswordResetToken('orphan-raw'),
          expiresAt: new Date(now.getTime() + PASSWORD_RESET_TOKEN_TTL_MS),
          usedAt: null,
          createdAt: now,
        }),
      );

      await expect(
        service.resetPassword({ token: 'orphan-raw', newPassword: NEW_PASSWORD }),
      ).rejects.toThrow(InvalidPasswordResetTokenError);
    });
  });
});
