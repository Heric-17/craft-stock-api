import type { Response } from 'supertest';

import { REFRESH_TOKEN_COOKIE } from '../../src/modules/auth/presentation/refresh-token-cookie';

export interface ParsedCookie {
  /** The raw value; empty string when the cookie is being cleared. */
  value: string;
  /** Attribute names lowercased; valueless flags map to the empty string. */
  attributes: Record<string, string>;
}

/**
 * Finds the refresh token cookie in a response's `Set-Cookie` headers and
 * splits it into its value and attributes, so a test can assert on
 * `HttpOnly`, `Path` and `Max-Age` rather than string-matching a header.
 */
export function parseRefreshCookie(response: Response): ParsedCookie | null {
  const header: unknown = response.headers['set-cookie'];
  const cookies = Array.isArray(header)
    ? (header as string[])
    : typeof header === 'string'
      ? [header]
      : [];
  const raw = cookies.find((cookie) => cookie.startsWith(`${REFRESH_TOKEN_COOKIE}=`));

  if (raw === undefined) {
    return null;
  }

  const [pair, ...rest] = raw.split('; ');
  const attributes: Record<string, string> = {};

  for (const attribute of rest) {
    const separator = attribute.indexOf('=');
    const name = (separator === -1 ? attribute : attribute.slice(0, separator)).toLowerCase();
    attributes[name] = separator === -1 ? '' : attribute.slice(separator + 1);
  }

  return { value: pair.slice(`${REFRESH_TOKEN_COOKIE}=`.length), attributes };
}

/** The refresh token out of a login/refresh response, or `null` if none was set. */
export function refreshTokenFrom(response: Response): string | null {
  const cookie = parseRefreshCookie(response);

  return cookie === null || cookie.value.length === 0 ? null : cookie.value;
}

/** Same, but fails the test rather than handing back `null`. */
export function requireRefreshToken(response: Response): string {
  const token = refreshTokenFrom(response);

  if (token === null) {
    throw new Error(`Response set no ${REFRESH_TOKEN_COOKIE} cookie.`);
  }

  return token;
}

/** Ready for `.set('Cookie', ...)`. */
export function refreshCookieHeader(token: string): string {
  return `${REFRESH_TOKEN_COOKIE}=${token}`;
}
