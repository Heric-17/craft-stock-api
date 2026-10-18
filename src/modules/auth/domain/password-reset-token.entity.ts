import { InvalidPasswordResetTokenError } from './auth.error';

/**
 * How long a reset link works. Short, because the link alone is enough to take
 * the account: it is a password in transit, and an hour is time to open a mail
 * app without leaving it lying around for days.
 */
export const PASSWORD_RESET_TOKEN_TTL_MS = 60 * 60 * 1000;

/**
 * Minimum gap between two reset e-mails for the same account. Without it the
 * public request route would let anyone fill a stranger's inbox, and there is
 * no rate limiter in front of the API to say otherwise.
 */
export const PASSWORD_RESET_COOLDOWN_MS = 60 * 1000;

export interface PasswordResetTokenProps {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  usedAt: Date | null;
  createdAt: Date;
}

export class PasswordResetToken {
  readonly id: string;
  readonly userId: string;
  readonly tokenHash: string;
  readonly expiresAt: Date;
  readonly usedAt: Date | null;
  readonly createdAt: Date;

  constructor(props: PasswordResetTokenProps) {
    if (props.expiresAt <= props.createdAt) {
      throw new InvalidPasswordResetTokenError(
        'A password reset token must expire after it is created.',
      );
    }

    this.id = props.id;
    this.userId = props.userId;
    this.tokenHash = props.tokenHash;
    this.expiresAt = props.expiresAt;
    this.usedAt = props.usedAt;
    this.createdAt = props.createdAt;
  }

  /** Not spent, and not past its expiry. */
  isUsable(now: Date): boolean {
    return this.usedAt === null && this.expiresAt > now;
  }

  /**
   * Marks the token spent. The row is kept: a second attempt with the same
   * link has to be refused, not forgotten.
   */
  markUsed(now: Date): PasswordResetToken {
    return new PasswordResetToken({ ...this, usedAt: now });
  }
}
