import { isSensitiveField, redactSensitiveText } from './sensitive-data';

describe('isSensitiveField', () => {
  it.each(['password', 'passwordHash', 'tokenHash', 'refreshToken', 'cpf', 'consumerCpf', 'CPF'])(
    'treats %s as sensitive',
    (field) => {
      expect(isSensitiveField(field)).toBe(true);
    },
  );

  it.each(['name', 'packageCost', 'merchantCnpj', 'accessKey'])('leaves %s alone', (field) => {
    expect(isSensitiveField(field)).toBe(false);
  });
});

describe('redactSensitiveText', () => {
  it.each([
    ['password=hunter2', 'hunter2'],
    ['password: hunter2', 'hunter2'],
    ['{"passwordHash":"$argon2id$v=19$m=65536"}', '$argon2id$'],
    ["refreshToken: 'abc.def.ghi'", 'abc.def.ghi'],
    ['cpf=12345678909', '12345678909'],
  ])('drops the value out of %s', (text, secret) => {
    const redacted = redactSensitiveText(text);

    expect(redacted).not.toContain(secret);
    expect(redacted).toContain('[REDACTED]');
  });

  it('keeps the field name, which is what makes the failure legible', () => {
    expect(redactSensitiveText('password=hunter2')).toBe('password=[REDACTED]');
  });

  it('redacts a JWT that arrives with no field name at all', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1MSJ9.9Fk3Qb';

    expect(redactSensitiveText(`Unexpected ${jwt} in body`)).not.toContain(jwt);
  });

  it('redacts a bearer credential echoed into a message', () => {
    expect(redactSensitiveText('Authorization: Bearer abc123def')).toBe(
      'Authorization: Bearer [REDACTED]',
    );
  });

  it.each(['529.982.247-25', '52998224725'])('redacts the CPF %s', (cpf) => {
    expect(redactSensitiveText(`Consumidor ${cpf} na nota`)).not.toContain(cpf);
  });

  /**
   * A CNPJ is not sensitive and is a legitimate part of an import failure —
   * and it contains eleven consecutive digits, which is what makes this worth
   * pinning down.
   */
  it('leaves a CNPJ intact', () => {
    expect(redactSensitiveText('CNPJ 12345678000199 rejected')).toContain('12345678000199');
  });

  it('leaves an NFC-e access key intact', () => {
    const accessKey = '4'.repeat(44);

    expect(redactSensitiveText(`Access key ${accessKey} is unknown`)).toContain(accessKey);
  });

  it('returns ordinary text unchanged', () => {
    expect(redactSensitiveText('Material not found')).toBe('Material not found');
  });
});
