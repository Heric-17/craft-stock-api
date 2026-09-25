import { isSensitiveField, omitSensitiveFields } from './sensitive-fields';

describe('isSensitiveField', () => {
  it.each(['passwordHash', 'tokenHash', 'refreshToken', 'cpf', 'customerCpf', 'PASSWORD'])(
    'flags %s as sensitive',
    (field) => {
      expect(isSensitiveField(field)).toBe(true);
    },
  );

  it.each(['name', 'customerName', 'packageCost', 'email'])(
    'does not flag %s as sensitive',
    (field) => {
      expect(isSensitiveField(field)).toBe(false);
    },
  );
});

describe('omitSensitiveFields', () => {
  it('drops sensitive fields entirely rather than masking them', () => {
    const changes = {
      name: { old: null, new: 'Heric' },
      passwordHash: { old: null, new: '$argon2id$...' },
    };

    const result = omitSensitiveFields(changes);

    expect(result).toEqual({ name: { old: null, new: 'Heric' } });
    expect(result).not.toHaveProperty('passwordHash');
    expect(JSON.stringify(result)).not.toContain('argon2id');
  });

  it('leaves a diff with no sensitive fields untouched', () => {
    const changes = { name: { old: 'A', new: 'B' } };

    expect(omitSensitiveFields(changes)).toEqual(changes);
  });
});
