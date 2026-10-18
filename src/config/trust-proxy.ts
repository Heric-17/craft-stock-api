import { isIP } from 'node:net';

import { CLOUDFLARE_IP_RANGES } from './cloudflare-ip-ranges';

/**
 * What Express is told about the proxies in front of the API: how many to
 * skip, or which addresses are proxies. See `parseTrustProxy`.
 */
export type TrustProxy = number | string[];

export const MAX_TRUSTED_PROXY_COUNT = 10;

/** Names Express understands, plus `cloudflare`, which this module expands. */
const KEYWORDS = ['loopback', 'linklocal', 'uniquelocal'] as const;
const CLOUDFLARE_KEYWORD = 'cloudflare';

export type TrustProxyParseResult =
  { ok: true; value: TrustProxy } | { ok: false; message: string };

/**
 * Reads the `TRUST_PROXY` setting, which says how to tell the client's address
 * from the proxies' in `X-Forwarded-For`. Two forms, and they are not mixed:
 *
 * - A COUNT (`1`): skip that many entries counting from the right. Right when
 *   the number of proxies never varies.
 * - A LIST (`loopback,uniquelocal,cloudflare`): skip entries from the right for
 *   as long as they are a known proxy, and stop at the first one that is not.
 *   Right when the chain is longer on some paths than others, as it is behind
 *   a platform router with a CDN in front, and the reason this form exists.
 *   The entries are the keywords Express knows (`loopback`, `linklocal`,
 *   `uniquelocal`), `cloudflare` for the ranges Cloudflare publishes, and any
 *   address or CIDR range.
 *
 * Both forms ignore whatever the client wrote at the left of the header,
 * because the walk from the right ends at the first address nobody vouches
 * for. `true` is deliberately not accepted: it vouches for all of them.
 */
export function parseTrustProxy(raw: string): TrustProxyParseResult {
  const text = raw.trim();

  if (/^\d+$/.test(text)) {
    const count = Number(text);

    return count <= MAX_TRUSTED_PROXY_COUNT
      ? { ok: true, value: count }
      : { ok: false, message: `a count must be between 0 and ${MAX_TRUSTED_PROXY_COUNT}` };
  }

  const entries = text.split(',').map((entry) => entry.trim());
  const trusted: string[] = [];

  for (const entry of entries) {
    if (entry.length === 0) {
      return { ok: false, message: 'has an empty entry in the list' };
    }

    if (entry.toLowerCase() === CLOUDFLARE_KEYWORD) {
      trusted.push(...CLOUDFLARE_IP_RANGES);
    } else if ((KEYWORDS as readonly string[]).includes(entry.toLowerCase())) {
      trusted.push(entry.toLowerCase());
    } else if (isAddressOrRange(entry)) {
      trusted.push(entry);
    } else {
      return {
        ok: false,
        message: `"${entry}" is not a count, a keyword (${[...KEYWORDS, CLOUDFLARE_KEYWORD].join(', ')}), an IP address or a CIDR range`,
      };
    }
  }

  return { ok: true, value: trusted };
}

function isAddressOrRange(entry: string): boolean {
  const [address, prefix, ...rest] = entry.split('/');
  const version = isIP(address);

  if (version === 0 || rest.length > 0) {
    return false;
  }

  if (prefix === undefined) {
    return true;
  }

  return /^\d+$/.test(prefix) && Number(prefix) <= (version === 4 ? 32 : 128);
}
