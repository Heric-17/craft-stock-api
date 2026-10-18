import { createHash } from 'node:crypto';

/**
 * SHA-256, for the same reason as `hashRefreshToken`: the token is a 256-bit
 * random value chosen by us, so a fast hash is enough to keep the raw value
 * out of the database, and it is also what makes the token findable by
 * lookup instead of by comparing against every row.
 */
export function hashPasswordResetToken(rawValue: string): string {
  return createHash('sha256').update(rawValue).digest('hex');
}
