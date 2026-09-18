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
});
