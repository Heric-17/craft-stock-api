import { resolvePublicBaseUrl } from './public-base-url';

describe('resolvePublicBaseUrl', () => {
  it('uses the configured base when there is one', () => {
    expect(resolvePublicBaseUrl('https://api.empresa.com.br', 3000)).toBe(
      'https://api.empresa.com.br',
    );
  });

  it('strips a trailing slash so callers can join with one', () => {
    expect(resolvePublicBaseUrl('https://api.empresa.com.br/', 3000)).toBe(
      'https://api.empresa.com.br',
    );
  });

  it('falls back to loopback on the configured port when unset', () => {
    expect(resolvePublicBaseUrl(undefined, 4000)).toBe('http://localhost:4000');
  });
});
