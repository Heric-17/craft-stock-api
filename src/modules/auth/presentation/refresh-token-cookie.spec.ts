import type { CookieOptions, Request, Response } from 'express';

import {
  REFRESH_TOKEN_COOKIE,
  clearRefreshTokenCookie,
  readRefreshTokenCookie,
  refreshTokenCookiePath,
  setRefreshTokenCookie,
} from './refresh-token-cookie';

interface RecordedCookie {
  name: string;
  value?: string;
  options: CookieOptions;
}

/**
 * A stand-in for the Express response that records what was written. Not a
 * mock of a framework class: it only has the two methods this module calls.
 */
function recorder(): { response: Response; set: RecordedCookie[]; cleared: RecordedCookie[] } {
  const set: RecordedCookie[] = [];
  const cleared: RecordedCookie[] = [];

  const response = {
    cookie(name: string, value: string, options: CookieOptions) {
      set.push({ name, value, options });
      return this;
    },
    clearCookie(name: string, options: CookieOptions) {
      cleared.push({ name, options });
      return this;
    },
  } as unknown as Response;

  return { response, set, cleared };
}

const config = { secure: true, maxAgeSeconds: 2_592_000 };

describe('refreshTokenCookiePath', () => {
  it('matches the path the auth routes live under', () => {
    expect(refreshTokenCookiePath()).toBe('/auth');
  });
});

describe('setRefreshTokenCookie', () => {
  it('writes the token with the attributes that keep it out of JavaScript', () => {
    const { response, set } = recorder();

    setRefreshTokenCookie(response, 'a-raw-refresh-token', config);

    expect(set).toHaveLength(1);
    expect(set[0].name).toBe(REFRESH_TOKEN_COOKIE);
    expect(set[0].value).toBe('a-raw-refresh-token');
    expect(set[0].options).toMatchObject({
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: refreshTokenCookiePath(),
    });
  });

  it('sets maxAge in milliseconds, matching the refresh token lifetime', () => {
    const { response, set } = recorder();

    setRefreshTokenCookie(response, 'token', { secure: true, maxAgeSeconds: 60 });

    expect(set[0].options.maxAge).toBe(60_000);
  });

  it('honours secure: false, for development over plain HTTP', () => {
    const { response, set } = recorder();

    setRefreshTokenCookie(response, 'token', { secure: false, maxAgeSeconds: 60 });

    expect(set[0].options.secure).toBe(false);
  });
});

describe('clearRefreshTokenCookie', () => {
  /**
   * A browser matches a removal by name, path and domain. Clearing with a
   * different path leaves the original cookie in place, and the user keeps
   * holding a revoked token that still looks like a session.
   */
  it('clears it with the same name and attributes it was written with', () => {
    const { response, set, cleared } = recorder();

    setRefreshTokenCookie(response, 'token', config);
    clearRefreshTokenCookie(response, config);

    expect(cleared).toHaveLength(1);
    expect(cleared[0].name).toBe(set[0].name);
    expect(cleared[0].options).toMatchObject({
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: set[0].options.path as string,
    });
  });
});

describe('readRefreshTokenCookie', () => {
  function requestWith(cookies: unknown): Request {
    return { cookies } as unknown as Request;
  }

  it('reads the token when the cookie is present', () => {
    expect(readRefreshTokenCookie(requestWith({ [REFRESH_TOKEN_COOKIE]: 'the-token' }))).toBe(
      'the-token',
    );
  });

  it('is null when no cookie was sent', () => {
    expect(readRefreshTokenCookie(requestWith({}))).toBeNull();
  });

  it('is null when the request was never cookie-parsed', () => {
    expect(readRefreshTokenCookie(requestWith(undefined))).toBeNull();
  });

  it('is null for another cookie by itself', () => {
    expect(readRefreshTokenCookie(requestWith({ somethingElse: 'value' }))).toBeNull();
  });

  /** An emptied cookie must not reach the rotation logic as a token to look up. */
  it('treats an empty or whitespace value as absent', () => {
    expect(readRefreshTokenCookie(requestWith({ [REFRESH_TOKEN_COOKIE]: '' }))).toBeNull();
    expect(readRefreshTokenCookie(requestWith({ [REFRESH_TOKEN_COOKIE]: '   ' }))).toBeNull();
  });

  it('is null when the cookie value is not a string', () => {
    expect(readRefreshTokenCookie(requestWith({ [REFRESH_TOKEN_COOKIE]: 42 }))).toBeNull();
  });
});
