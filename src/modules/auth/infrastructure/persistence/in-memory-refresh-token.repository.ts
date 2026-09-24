import type { RefreshToken } from '../../domain/refresh-token.entity';
import type { RefreshTokenRepository } from '../../domain/repositories/refresh-token.repository';

/** In-memory `RefreshTokenRepository` for `application/` tests. Never mocks Prisma. */
export class InMemoryRefreshTokenRepository implements RefreshTokenRepository {
  private readonly tokens = new Map<string, RefreshToken>();

  async findByTokenHash(tokenHash: string): Promise<RefreshToken | null> {
    return Promise.resolve(
      [...this.tokens.values()].find((token) => token.tokenHash === tokenHash) ?? null,
    );
  }

  async save(token: RefreshToken): Promise<void> {
    this.tokens.set(token.id, token);
    return Promise.resolve();
  }
}
