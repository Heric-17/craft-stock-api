import type { CookieOptions, Request, Response } from 'express';

/**
 * The cookie the refresh token travels in. Prefixed with the product name so
 * it cannot collide with another application's cookie on a shared parent
 * domain.
 */
export const REFRESH_TOKEN_COOKIE = 'craftstock_refresh_token';

/**
 * The cookie's `Path`. Matches the `/auth` routes the three session endpoints
 * live under (`src/modules/auth/presentation/auth.controller.ts`), which is
 * also what keeps the cookie out of every business route — those
 * authenticate with `Authorization: Bearer` and never see it (see
 * docs/auth-contract.md).
 *
 * If the API ever gains a global route prefix, this literal has to be
 * updated to match — a browser only sends a cookie to paths under its
 * `Path`, so letting the two drift apart would mean the cookie silently
 * stops being sent, with nothing failing loudly to say why.
 */
export function refreshTokenCookiePath(): string {
  return '/auth';
}

export interface RefreshTokenCookieConfig {
  /** `false` only for local development over plain HTTP — see AUTH_COOKIE_SECURE. */
  secure: boolean;
  /** Matches the refresh token's own lifetime, so neither outlives the other. */
  maxAgeSeconds: number;
}

function cookieOptions(config: RefreshTokenCookieConfig): CookieOptions {
  return {
    // The whole point: JavaScript on the page cannot read it, so an XSS
    // cannot lift the long-lived half of the session.
    httpOnly: true,
    secure: config.secure,
    // 'lax', not 'strict': the cookie must still arrive when the user lands
    // on the SPA by following a link from elsewhere, which is exactly when a
    // silent refresh has to work. 'lax' requires the frontend and the API to
    // be on the same registrable domain — docs/auth-contract.md spells out
    // what that means for how an installation is deployed.
    sameSite: 'lax',
    path: refreshTokenCookiePath(),
  };
}

/**
 * Writes the refresh token cookie. Called on login and on every refresh,
 * which re-arms `maxAge` from scratch — a sliding session, registered as a
 * deliberate choice in docs/auth-contract.md.
 */
export function setRefreshTokenCookie(
  response: Response,
  token: string,
  config: RefreshTokenCookieConfig,
): void {
  response.cookie(REFRESH_TOKEN_COOKIE, token, {
    ...cookieOptions(config),
    maxAge: config.maxAgeSeconds * 1_000,
  });
}

/**
 * Clears the cookie on logout.
 *
 * The attributes have to match the ones it was written with — a browser
 * matches a removal by name, path and domain, so clearing it with a
 * different path leaves the original cookie in place and the user still
 * holding a revoked token that looks like a session.
 */
export function clearRefreshTokenCookie(
  response: Response,
  config: RefreshTokenCookieConfig,
): void {
  response.clearCookie(REFRESH_TOKEN_COOKIE, cookieOptions(config));
}

/**
 * Reads the refresh token out of the request, or `null` when there is none.
 *
 * Whitespace-only is treated as absent: a cleared cookie that some
 * intermediary turned into an empty string must not reach the rotation logic
 * as if it were a token to look up.
 */
export function readRefreshTokenCookie(request: Request): string | null {
  const cookies: unknown = (request as { cookies?: unknown }).cookies;

  if (typeof cookies !== 'object' || cookies === null) {
    return null;
  }

  const value: unknown = (cookies as Record<string, unknown>)[REFRESH_TOKEN_COOKIE];

  if (typeof value !== 'string' || value.trim().length === 0) {
    return null;
  }

  return value;
}
