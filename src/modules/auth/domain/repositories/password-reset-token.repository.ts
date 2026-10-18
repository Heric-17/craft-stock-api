import type { PasswordResetToken } from '../password-reset-token.entity';

export interface PasswordResetTokenRepository {
  findByTokenHash(tokenHash: string): Promise<PasswordResetToken | null>;
  /** The most recently created token of the user, used or not. */
  findLatestByUserId(userId: string): Promise<PasswordResetToken | null>;
  save(token: PasswordResetToken): Promise<void>;
  /**
   * Spends every token of the user that is still usable. A new request
   * supersedes the older links, and a completed reset closes whatever else
   * was left open, so only the newest mail ever works.
   */
  markAllUsedByUserId(userId: string, now: Date): Promise<void>;
}
