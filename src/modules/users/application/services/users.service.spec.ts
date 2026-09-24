import type { Env } from '../../../../config/env.schema';
import type { EnvService } from '../../../../config/env.service';
import { Argon2PasswordHasher } from '../../../../shared/infrastructure/security/argon2-password-hasher';
import { InMemoryUnitOfWork } from '../../../../shared/infrastructure/persistence/in-memory-unit-of-work';
import type { RepositoryContext } from '../../../../shared/domain/persistence/unit-of-work';
import { InMemoryCompositeProductRepository } from '../../../composite-products/infrastructure/persistence/in-memory-composite-product.repository';
import { InMemoryRefreshTokenRepository } from '../../../auth/infrastructure/persistence/in-memory-refresh-token.repository';
import { InMemoryPendingInvoiceRepository } from '../../../invoices/infrastructure/persistence/in-memory-pending-invoice.repository';
import { InMemoryMaterialRepository } from '../../../materials/infrastructure/persistence/in-memory-material.repository';
import { InMemoryPurchaseRepository } from '../../../purchases/infrastructure/persistence/in-memory-purchase.repository';
import { InMemorySaleRepository } from '../../../sales/infrastructure/persistence/in-memory-sale.repository';
import { EmailAlreadyInUseError, UserNotFoundError } from '../../domain/user.error';
import { InMemoryUserRepository } from '../../infrastructure/persistence/in-memory-user.repository';
import type { RegisterUserInput } from '../dto/users.dto';
import { UsersService } from './users.service';

function buildEnv(): EnvService {
  return {
    get: <K extends keyof Env>(key: K): Env[K] =>
      ({ ARGON2_TIME_COST: 2 })[key as string] as Env[K],
  } as EnvService;
}

function buildService(): { service: UsersService; users: InMemoryUserRepository } {
  const users = new InMemoryUserRepository();
  const context: RepositoryContext = {
    materials: new InMemoryMaterialRepository(),
    compositeProducts: new InMemoryCompositeProductRepository(),
    sales: new InMemorySaleRepository(),
    purchases: new InMemoryPurchaseRepository(),
    pendingInvoices: new InMemoryPendingInvoiceRepository(),
    users,
    refreshTokens: new InMemoryRefreshTokenRepository(),
  };

  const service = new UsersService(
    users,
    new Argon2PasswordHasher(buildEnv()),
    new InMemoryUnitOfWork(context),
  );

  return { service, users };
}

function buildInput(overrides: Partial<RegisterUserInput> = {}): RegisterUserInput {
  return {
    email: 'heric@craftstock.dev',
    password: 'correct horse battery staple',
    name: 'Heric',
    ...overrides,
  };
}

describe('UsersService', () => {
  describe('register', () => {
    it('creates the user with a hashed password, never the plain text', async () => {
      const { service, users } = buildService();

      const view = await service.register(buildInput());

      const stored = await users.findById(view.id);
      expect(stored?.passwordHash).not.toBe('correct horse battery staple');
      expect(stored?.passwordHash).toMatch(/^\$argon2id\$/);
    });

    it('never includes passwordHash on the returned view', async () => {
      const { service } = buildService();

      const view = await service.register(buildInput());

      expect(view).not.toHaveProperty('passwordHash');
      expect(view.email).toBe('heric@craftstock.dev');
      expect(view.name).toBe('Heric');
    });

    it('rejects a second registration with the same email', async () => {
      const { service } = buildService();
      await service.register(buildInput());

      await expect(service.register(buildInput({ name: 'Outro Heric' }))).rejects.toThrow(
        EmailAlreadyInUseError,
      );
    });
  });

  describe('getById', () => {
    it('returns the profile of an existing user', async () => {
      const { service } = buildService();
      const created = await service.register(buildInput());

      const profile = await service.getById(created.id);

      expect(profile.id).toBe(created.id);
      expect(profile.email).toBe('heric@craftstock.dev');
    });

    it('throws UserNotFoundError for an id that does not exist', async () => {
      const { service } = buildService();

      await expect(service.getById('missing-id')).rejects.toThrow(UserNotFoundError);
    });
  });
});
