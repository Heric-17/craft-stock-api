import { buildPasswordResetLink, composePasswordResetEmail } from './password-reset-email';

describe('buildPasswordResetLink', () => {
  it('puts the token in the fragment, so it never reaches a server log or a Referer header', () => {
    const link = buildPasswordResetLink('https://app.empresa.com.br', 'abc123');

    expect(link).toBe('https://app.empresa.com.br/redefinir-senha#token=abc123');
    expect(new URL(link).search).toBe('');
  });

  it('ignores a trailing slash on the base', () => {
    expect(buildPasswordResetLink('https://app.empresa.com.br/', 'abc')).toBe(
      'https://app.empresa.com.br/redefinir-senha#token=abc',
    );
  });

  it('falls back to the local development address when none is configured', () => {
    expect(buildPasswordResetLink(undefined, 'abc')).toBe(
      'http://localhost:5173/redefinir-senha#token=abc',
    );
  });
});

describe('composePasswordResetEmail', () => {
  it('is written in Portuguese, addressed to the person, and carries the link', () => {
    const message = composePasswordResetEmail({
      to: 'ana@exemplo.com',
      name: 'Ana',
      link: 'https://app.empresa.com.br/redefinir-senha#token=abc',
    });

    expect(message.to).toBe('ana@exemplo.com');
    expect(message.subject).toBe('Redefinição de senha do CraftStock');
    expect(message.text).toContain('Olá, Ana.');
    expect(message.text).toContain('https://app.empresa.com.br/redefinir-senha#token=abc');
    expect(message.text).toContain('60 minutos');
  });
});
