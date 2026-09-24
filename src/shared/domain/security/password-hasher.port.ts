export const PASSWORD_HASHER = Symbol('PASSWORD_HASHER');

/**
 * Hashes and verifies passwords. Generic on purpose — nothing here is
 * specific to `User` — so both registration and login depend on the same
 * port without either module reaching into the other.
 */
export interface PasswordHasher {
  hash(plainTextPassword: string): Promise<string>;
  verify(passwordHash: string, plainTextPassword: string): Promise<boolean>;
}
