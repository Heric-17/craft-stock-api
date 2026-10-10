import { DEVELOPMENT_CORS_ORIGINS, resolveCorsOrigins } from './cors-origins';

describe('resolveCorsOrigins', () => {
  it('splits a comma-separated list', () => {
    expect(
      resolveCorsOrigins('https://app.empresa.com.br,https://admin.empresa.com.br', true),
    ).toEqual(['https://app.empresa.com.br', 'https://admin.empresa.com.br']);
  });

  it('trims whitespace and drops empty entries', () => {
    expect(resolveCorsOrigins(' https://app.empresa.com.br , , ', true)).toEqual([
      'https://app.empresa.com.br',
    ]);
  });

  it('falls back to the Vite dev server outside production', () => {
    expect(resolveCorsOrigins('', false)).toEqual([...DEVELOPMENT_CORS_ORIGINS]);
  });

  it('prefers what is configured over the development fallback', () => {
    expect(resolveCorsOrigins('http://localhost:4200', false)).toEqual(['http://localhost:4200']);
  });

  /**
   * Production with nothing configured never reaches here — `envSchema`
   * refuses to start. If it somehow did, an empty allow-list refuses every
   * browser, which is the safe direction to fail in.
   */
  it('never falls back to anything in production', () => {
    expect(resolveCorsOrigins('', true)).toEqual([]);
  });

  it('never yields a wildcard', () => {
    expect(resolveCorsOrigins('*', false)).not.toContain('*');
  });
});
