import { InvalidPasswordResetTokenError } from './auth.error';
import { PasswordResetToken, PASSWORD_RESET_TOKEN_TTL_MS } from './password-reset-token.entity';

const CREATED_AT = new Date('2026-10-17T12:00:00.000Z');

function build(overrides: Partial<ConstructorParameters<typeof PasswordResetToken>[0]> = {}) {
  return new PasswordResetToken({
    id: 'token-1',
    userId: 'user-1',
    tokenHash: 'hash',
    expiresAt: new Date(CREATED_AT.getTime() + PASSWORD_RESET_TOKEN_TTL_MS),
    usedAt: null,
    createdAt: CREATED_AT,
    ...overrides,
  });
}

describe('PasswordResetToken', () => {
  it('is usable until it expires', () => {
    const token = build();

    expect(token.isUsable(CREATED_AT)).toBe(true);
    expect(token.isUsable(new Date(token.expiresAt.getTime() - 1))).toBe(true);
    expect(token.isUsable(token.expiresAt)).toBe(false);
  });

  it('is no longer usable once marked used, and the original is left untouched', () => {
    const token = build();

    const spent = token.markUsed(new Date(CREATED_AT.getTime() + 1000));

    expect(spent.isUsable(CREATED_AT)).toBe(false);
    expect(spent.usedAt).not.toBeNull();
    expect(token.usedAt).toBeNull();
  });

  it('must expire after it was created', () => {
    expect(() => build({ expiresAt: CREATED_AT })).toThrow(InvalidPasswordResetTokenError);
  });
});
