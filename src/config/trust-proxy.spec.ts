import { CLOUDFLARE_IP_RANGES } from './cloudflare-ip-ranges';
import { parseTrustProxy } from './trust-proxy';

describe('parseTrustProxy', () => {
  describe('a count', () => {
    it.each([
      ['0', 0],
      ['1', 1],
      [' 3 ', 3],
      ['10', 10],
    ])('reads %j as %d', (raw, count) => {
      expect(parseTrustProxy(raw)).toEqual({ ok: true, value: count });
    });

    it('refuses more proxies than anyone has', () => {
      expect(parseTrustProxy('11')).toMatchObject({ ok: false });
    });
  });

  describe('a list', () => {
    it('keeps the keywords Express knows', () => {
      expect(parseTrustProxy('loopback, UniqueLocal')).toEqual({
        ok: true,
        value: ['loopback', 'uniquelocal'],
      });
    });

    it('expands cloudflare into the published ranges, in place', () => {
      expect(parseTrustProxy('loopback,cloudflare,203.0.113.7')).toEqual({
        ok: true,
        value: ['loopback', ...CLOUDFLARE_IP_RANGES, '203.0.113.7'],
      });
    });

    it.each(['10.0.0.1', '10.0.0.0/8', '2001:db8::/32', '::1', '203.0.113.0/24'])(
      'accepts the address or range %s',
      (entry) => {
        expect(parseTrustProxy(entry)).toEqual({ ok: true, value: [entry] });
      },
    );

    /** `true` vouches for every entry, the client's own included. */
    it.each(['true', 'false', 'all', '*', '1,loopback', 'loopback,,cloudflare', 'loopback,'])(
      'refuses %j',
      (raw) => {
        expect(parseTrustProxy(raw)).toMatchObject({ ok: false });
      },
    );

    it.each([
      '10.0.0.0/33',
      '2001:db8::/129',
      '10.0.0.0/',
      '10.0.0.0/8/8',
      '300.1.1.1',
      '10.0.0/8',
    ])('refuses the malformed range %s', (entry) => {
      expect(parseTrustProxy(entry)).toMatchObject({ ok: false });
    });

    it('names the entry it could not read', () => {
      const result = parseTrustProxy('loopback,nginx');

      expect(result.ok).toBe(false);
      expect(!result.ok && result.message).toContain('"nginx"');
    });
  });
});

describe('CLOUDFLARE_IP_RANGES', () => {
  /** Every range is one `parseTrustProxy` accepts, so a typo here fails a test, not a boot. */
  it('holds only valid ranges', () => {
    for (const range of CLOUDFLARE_IP_RANGES) {
      expect(parseTrustProxy(range)).toEqual({ ok: true, value: [range] });
    }
  });

  it('covers the edge addresses seen in front of the Render service', () => {
    const result = parseTrustProxy('cloudflare');

    expect(result.ok && result.value).toEqual(expect.arrayContaining(['172.64.0.0/13']));
    expect(result.ok && result.value).toEqual(expect.arrayContaining(['162.158.0.0/15']));
  });
});
