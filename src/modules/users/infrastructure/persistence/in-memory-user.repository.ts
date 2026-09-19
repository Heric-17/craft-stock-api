import type { User } from '../../domain/user.entity';
import type { UserRepository } from '../../domain/repositories/user.repository';

/** In-memory `UserRepository` for `application/` tests. Never mocks Prisma. */
export class InMemoryUserRepository implements UserRepository {
  private readonly users = new Map<string, User>();

  async findById(id: string): Promise<User | null> {
    return Promise.resolve(this.users.get(id) ?? null);
  }

  async findByEmail(email: string): Promise<User | null> {
    return Promise.resolve([...this.users.values()].find((user) => user.email === email) ?? null);
  }

  async save(user: User): Promise<void> {
    this.users.set(user.id, user);
    return Promise.resolve();
  }

  async delete(id: string): Promise<void> {
    this.users.delete(id);
    return Promise.resolve();
  }
}
