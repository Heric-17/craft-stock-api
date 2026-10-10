/**
 * The absolute base a locally stored image key is resolved against.
 *
 * `PUBLIC_BASE_URL` is required in production (enforced in `envSchema`), so
 * the loopback fallback here only ever applies to a development machine or
 * the test suite. It is deliberately not a schema default: a default would
 * let a production installation boot with `http://localhost:3000` and serve
 * every client an image URL that resolves to the client's own machine —
 * broken, and broken quietly.
 *
 * Any trailing slash is removed so callers can join with `/` unconditionally.
 */
export function resolvePublicBaseUrl(publicBaseUrl: string | undefined, port: number): string {
  const base = publicBaseUrl ?? `http://localhost:${port}`;

  return base.replace(/\/+$/, '');
}
