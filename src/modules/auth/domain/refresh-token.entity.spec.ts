import { InvalidRefreshTokenError } from './auth.error';
import { RefreshToken } from './refresh-token.entity';

function build(
  overrides: Partial<ConstructorParameters<typeof RefreshToken>[0]> = {},
): RefreshToken {
  return new RefreshToken({
    id: 'token-1',
    userId: 'user-1',
    tokenHash: 'a'.repeat(64),
    expiresAt: new Date('2026-01-02T00:00:00Z'),
    revokedAt: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  });
}

describe('RefreshToken', () => {
  it('rejects an expiry that is not after creation', () => {
    expect(() =>
      build({
        createdAt: new Date('2026-01-02T00:00:00Z'),
        expiresAt: new Date('2026-01-01T00:00:00Z'),
      }),
    ).toThrow(InvalidRefreshTokenError);
  });

  describe('isActive', () => {
    it('is active before its expiry and with no revocation', () => {
      const token = build();
      expect(token.isActive(new Date('2026-01-01T12:00:00Z'))).toBe(true);
    });

    it('is not active once past its expiry', () => {
      const token = build();
      expect(token.isActive(new Date('2026-01-02T00:00:01Z'))).toBe(false);
    });

    it('is not active once revoked, even before its expiry', () => {
      const token = build({ revokedAt: new Date('2026-01-01T06:00:00Z') });
      expect(token.isActive(new Date('2026-01-01T12:00:00Z'))).toBe(false);
    });
  });

  describe('revoke', () => {
    it('sets revokedAt without mutating the original instance', () => {
      const token = build();
      const now = new Date('2026-01-01T06:00:00Z');

      const revoked = token.revoke(now);

      expect(revoked.revokedAt).toEqual(now);
      expect(token.revokedAt).toBeNull();
    });
  });
});
