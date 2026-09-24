import type { Env } from '../../../config/env.schema';
import type { EnvService } from '../../../config/env.service';
import { Argon2PasswordHasher } from './argon2-password-hasher';

function buildHasher(timeCost = 2): Argon2PasswordHasher {
  const env = {
    get: <K extends keyof Env>(key: K): Env[K] =>
      ({ ARGON2_TIME_COST: timeCost })[key as string] as Env[K],
  } as EnvService;

  return new Argon2PasswordHasher(env);
}

describe('Argon2PasswordHasher', () => {
  it('produces a hash that verifies against the original password', async () => {
    const hasher = buildHasher();

    const hash = await hasher.hash('correct horse battery staple');

    await expect(hasher.verify(hash, 'correct horse battery staple')).resolves.toBe(true);
  });

  it('rejects a hash checked against the wrong password', async () => {
    const hasher = buildHasher();

    const hash = await hasher.hash('correct horse battery staple');

    await expect(hasher.verify(hash, 'wrong password')).resolves.toBe(false);
  });

  it('never returns the plain text as the hash', async () => {
    const hasher = buildHasher();

    const hash = await hasher.hash('correct horse battery staple');

    expect(hash).not.toBe('correct horse battery staple');
    expect(hash).toMatch(/^\$argon2id\$/);
  });
});
