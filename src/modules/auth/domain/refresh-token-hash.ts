import { createHash } from 'node:crypto';

/**
 * SHA-256, not the slow, salted hash `PasswordHasher` uses. A refresh token
 * is a 256-bit random value chosen by us, not a low-entropy secret a person
 * picked — there is no dictionary or brute-force risk for a fast hash to
 * defend against here, only a lookup key that must not be the raw token
 * itself at rest.
 */
export function hashRefreshToken(rawValue: string): string {
  return createHash('sha256').update(rawValue).digest('hex');
}
