import { InvalidUserError } from './user.error';
import { User } from './user.entity';

function build(overrides: Partial<ConstructorParameters<typeof User>[0]> = {}): User {
  return new User({
    id: 'user-1',
    email: 'heric@craftstock.dev',
    passwordHash: 'hashed-password',
    name: 'Heric',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  });
}

describe('User', () => {
  it('builds with a valid email', () => {
    const user = build();

    expect(user.email).toBe('heric@craftstock.dev');
  });

  it('rejects an invalid email', () => {
    expect(() => build({ email: 'not-an-email' })).toThrow(InvalidUserError);
  });

  it('rejects an empty passwordHash', () => {
    expect(() => build({ passwordHash: ' ' })).toThrow(InvalidUserError);
  });

  it('rejects an empty name', () => {
    expect(() => build({ name: ' ' })).toThrow(InvalidUserError);
  });

  it('changes the password hash into a new instance and touches nothing else', () => {
    const user = build();
    const later = new Date('2026-02-01T00:00:00Z');

    const changed = user.changePassword('new-hash', later);

    expect(changed.passwordHash).toBe('new-hash');
    expect(changed.updatedAt).toEqual(later);
    expect(changed.id).toBe(user.id);
    expect(changed.email).toBe(user.email);
    expect(changed.createdAt).toEqual(user.createdAt);
    expect(user.passwordHash).toBe('hashed-password');
  });

  it('refuses to change to an empty hash', () => {
    expect(() => build().changePassword(' ', new Date())).toThrow(InvalidUserError);
  });
});
