import type { PasswordResetToken } from '../../domain/password-reset-token.entity';
import type { PasswordResetTokenRepository } from '../../domain/repositories/password-reset-token.repository';

/** In-memory `PasswordResetTokenRepository` for `application/` tests. Never mocks Prisma. */
export class InMemoryPasswordResetTokenRepository implements PasswordResetTokenRepository {
  private readonly tokens = new Map<string, PasswordResetToken>();

  async findByTokenHash(tokenHash: string): Promise<PasswordResetToken | null> {
    return Promise.resolve(
      [...this.tokens.values()].find((token) => token.tokenHash === tokenHash) ?? null,
    );
  }

  async findLatestByUserId(userId: string): Promise<PasswordResetToken | null> {
    const latest = [...this.tokens.values()]
      .filter((token) => token.userId === userId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    return Promise.resolve(latest[0] ?? null);
  }

  async save(token: PasswordResetToken): Promise<void> {
    this.tokens.set(token.id, token);
    return Promise.resolve();
  }

  async markAllUsedByUserId(userId: string, now: Date): Promise<void> {
    for (const token of this.tokens.values()) {
      if (token.userId === userId && token.usedAt === null) {
        this.tokens.set(token.id, token.markUsed(now));
      }
    }

    return Promise.resolve();
  }

  /** For assertions in tests: every token ever saved. */
  all(): PasswordResetToken[] {
    return [...this.tokens.values()];
  }
}
