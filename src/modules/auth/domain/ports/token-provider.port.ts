export const TOKEN_PROVIDER = Symbol('TOKEN_PROVIDER');

/** What a verified token says about who is making the request. */
export interface AuthTokenPayload {
  sub: string;
  email: string;
}

export interface SignedToken {
  accessToken: string;
  expiresInSeconds: number;
}

/**
 * Issues and verifies session tokens. Only one implementation exists
 * (`JwtTokenProvider`), but the port still sits in `domain/` and is injected
 * by token like every other dependency in this codebase, so swapping the
 * signing scheme later — or faking it in a test — never touches a caller.
 */
export interface TokenProvider {
  sign(payload: AuthTokenPayload): SignedToken;
  /** Throws `InvalidTokenError` when the token's signature or expiry does not check out. */
  verify(token: string): AuthTokenPayload;
}
