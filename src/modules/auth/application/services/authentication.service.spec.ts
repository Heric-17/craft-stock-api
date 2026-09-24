import type { Env } from '../../../../config/env.schema';
import type { EnvService } from '../../../../config/env.service';
import { InMemoryUnitOfWork } from '../../../../shared/infrastructure/persistence/in-memory-unit-of-work';
import type { RepositoryContext } from '../../../../shared/domain/persistence/unit-of-work';
import { Argon2PasswordHasher } from '../../../../shared/infrastructure/security/argon2-password-hasher';
import { InMemoryCompositeProductRepository } from '../../../composite-products/infrastructure/persistence/in-memory-composite-product.repository';
import { InMemoryPendingInvoiceRepository } from '../../../invoices/infrastructure/persistence/in-memory-pending-invoice.repository';
import { InMemoryMaterialRepository } from '../../../materials/infrastructure/persistence/in-memory-material.repository';
import { InMemoryPurchaseRepository } from '../../../purchases/infrastructure/persistence/in-memory-purchase.repository';
import { InMemorySaleRepository } from '../../../sales/infrastructure/persistence/in-memory-sale.repository';
import { User } from '../../../users/domain/user.entity';
import { InMemoryUserRepository } from '../../../users/infrastructure/persistence/in-memory-user.repository';
import { InvalidCredentialsError, InvalidRefreshTokenError } from '../../domain/auth.error';
import { hashRefreshToken } from '../../domain/refresh-token-hash';
import { RefreshToken } from '../../domain/refresh-token.entity';
import { InMemoryRefreshTokenRepository } from '../../infrastructure/persistence/in-memory-refresh-token.repository';
import { JwtTokenProvider } from '../../infrastructure/security/jwt-token.provider';
import { AuthenticationService } from './authentication.service';

const PLAIN_PASSWORD = 'correct horse battery staple';

function buildEnv(overrides: Partial<Env> = {}): EnvService {
  const values: Partial<Env> = {
    ARGON2_TIME_COST: 2,
    JWT_SECRET: 'a-test-secret-that-is-long-enough',
    JWT_EXPIRES_IN_SECONDS: 900,
    REFRESH_TOKEN_EXPIRES_IN_SECONDS: 2_592_000,
    ...overrides,
  };

  return { get: <K extends keyof Env>(key: K): Env[K] => values[key] as Env[K] } as EnvService;
}

async function buildService(): Promise<{
  service: AuthenticationService;
  user: User;
  refreshTokens: InMemoryRefreshTokenRepository;
}> {
  const passwordHasher = new Argon2PasswordHasher(buildEnv());
  const users = new InMemoryUserRepository();
  const refreshTokens = new InMemoryRefreshTokenRepository();

  const now = new Date();
  const user = new User({
    id: 'user-1',
    email: 'heric@craftstock.dev',
    passwordHash: await passwordHasher.hash(PLAIN_PASSWORD),
    name: 'Heric',
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
    users,
    refreshTokens,
  };

  const service = new AuthenticationService(
    new InMemoryUnitOfWork(context),
    passwordHasher,
    new JwtTokenProvider(buildEnv()),
    buildEnv(),
  );

  return { service, user, refreshTokens };
}

describe('AuthenticationService', () => {
  describe('login', () => {
    it('issues an access token and a refresh token for the correct email and password', async () => {
      const { service } = await buildService();

      const result = await service.login({
        email: 'heric@craftstock.dev',
        password: PLAIN_PASSWORD,
      });

      expect(result.tokenType).toBe('Bearer');
      expect(result.expiresInSeconds).toBe(900);
      expect(typeof result.accessToken).toBe('string');
      expect(typeof result.refreshToken).toBe('string');
    });

    it('persists only the hash of the refresh token, never the raw value', async () => {
      const { service, refreshTokens } = await buildService();

      const result = await service.login({
        email: 'heric@craftstock.dev',
        password: PLAIN_PASSWORD,
      });

      const stored = await refreshTokens.findByTokenHash(hashRefreshToken(result.refreshToken));
      expect(stored).not.toBeNull();
    });

    it('rejects the wrong password', async () => {
      const { service } = await buildService();

      await expect(
        service.login({ email: 'heric@craftstock.dev', password: 'wrong password' }),
      ).rejects.toThrow(InvalidCredentialsError);
    });

    it('rejects an email that has no account, with the same error as a wrong password', async () => {
      const { service } = await buildService();

      await expect(
        service.login({ email: 'unknown@craftstock.dev', password: PLAIN_PASSWORD }),
      ).rejects.toThrow(InvalidCredentialsError);
    });
  });

  describe('refresh', () => {
    it('trades a valid refresh token for a new access and refresh token', async () => {
      const { service } = await buildService();
      const logged = await service.login({
        email: 'heric@craftstock.dev',
        password: PLAIN_PASSWORD,
      });

      const refreshed = await service.refresh(logged.refreshToken);

      expect(typeof refreshed.accessToken).toBe('string');
      expect(refreshed.refreshToken).not.toBe(logged.refreshToken);
    });

    it('rotates: the old refresh token cannot be used a second time', async () => {
      const { service } = await buildService();
      const logged = await service.login({
        email: 'heric@craftstock.dev',
        password: PLAIN_PASSWORD,
      });

      await service.refresh(logged.refreshToken);

      await expect(service.refresh(logged.refreshToken)).rejects.toThrow(InvalidRefreshTokenError);
    });

    it('rejects a refresh token that was never issued', async () => {
      const { service } = await buildService();

      await expect(service.refresh('not-a-real-token')).rejects.toThrow(InvalidRefreshTokenError);
    });

    it('rejects an expired refresh token', async () => {
      const { service, refreshTokens } = await buildService();
      const rawToken = 'a-raw-refresh-token-value';

      // Seeded directly rather than produced by `login`: the entity itself
      // refuses to be constructed already expired (`expiresAt` must be after
      // `createdAt`), so an expired-at-rest token can only arise from one
      // that was valid when issued and has since passed its expiry.
      await refreshTokens.save(
        new RefreshToken({
          id: 'expired-token',
          userId: 'user-1',
          tokenHash: hashRefreshToken(rawToken),
          createdAt: new Date('2020-01-01T00:00:00Z'),
          expiresAt: new Date('2020-01-01T00:00:01Z'),
          revokedAt: null,
        }),
      );

      await expect(service.refresh(rawToken)).rejects.toThrow(InvalidRefreshTokenError);
    });
  });

  describe('logout', () => {
    it('revokes the refresh token so it can no longer be used to refresh', async () => {
      const { service } = await buildService();
      const logged = await service.login({
        email: 'heric@craftstock.dev',
        password: PLAIN_PASSWORD,
      });

      await service.logout(logged.refreshToken);

      await expect(service.refresh(logged.refreshToken)).rejects.toThrow(InvalidRefreshTokenError);
    });

    it('does nothing, and does not throw, for a token that does not exist', async () => {
      const { service } = await buildService();

      await expect(service.logout('not-a-real-token')).resolves.toBeUndefined();
    });
  });
});
