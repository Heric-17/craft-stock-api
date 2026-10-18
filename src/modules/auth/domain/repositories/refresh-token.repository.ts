import type { RefreshToken } from '../refresh-token.entity';

export const REFRESH_TOKEN_REPOSITORY = Symbol('REFRESH_TOKEN_REPOSITORY');

export interface RefreshTokenRepository {
  findByTokenHash(tokenHash: string): Promise<RefreshToken | null>;
  save(token: RefreshToken): Promise<void>;
  /**
   * Revokes every still-active token of the user: the sessions on all their
   * devices. `exceptTokenHash` spares one, the session the person is using
   * right now when they change their own password.
   */
  revokeActiveByUserId(userId: string, now: Date, exceptTokenHash?: string): Promise<void>;
}
