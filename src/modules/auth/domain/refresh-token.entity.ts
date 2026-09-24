import { InvalidRefreshTokenError } from './auth.error';

export interface RefreshTokenProps {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
  createdAt: Date;
}

export class RefreshToken {
  readonly id: string;
  readonly userId: string;
  readonly tokenHash: string;
  readonly expiresAt: Date;
  readonly revokedAt: Date | null;
  readonly createdAt: Date;

  constructor(props: RefreshTokenProps) {
    if (props.expiresAt <= props.createdAt) {
      throw new InvalidRefreshTokenError('A refresh token must expire after it is created.');
    }

    this.id = props.id;
    this.userId = props.userId;
    this.tokenHash = props.tokenHash;
    this.expiresAt = props.expiresAt;
    this.revokedAt = props.revokedAt;
    this.createdAt = props.createdAt;
  }

  /** Not revoked, and not past its expiry. */
  isActive(now: Date): boolean {
    return this.revokedAt === null && this.expiresAt > now;
  }

  /**
   * Marks the token spent — on rotation, when a fresher one takes its place,
   * or on logout. The row is kept rather than deleted: it is what turns a
   * second attempt to use this same token into a detectable event instead of
   * a silent success, and it holds nothing more sensitive than a hash.
   */
  revoke(now: Date): RefreshToken {
    return new RefreshToken({ ...this, revokedAt: now });
  }
}
