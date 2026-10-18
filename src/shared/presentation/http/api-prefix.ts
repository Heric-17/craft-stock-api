/**
 * The global route prefix of the API: routes live at `/api/auth`, `/api/sales`
 * and so on.
 *
 * The web app is served from its own host and reaches the API through a
 * rewrite of `/api/*` on that host, so the browser only ever talks to one
 * site. The prefix is what makes the paths line up on both sides: the cookie
 * the API sets has to name the path the browser actually calls.
 *
 * It is declared once, here, and applied to the app by `configureApp`, so that
 * anything that has to know where a route really lives asks this module
 * instead of repeating a literal. The refresh token cookie is the case that
 * matters: a browser only sends a cookie to paths under its `Path`, so a
 * literal that stopped matching the routes would silently stop the cookie
 * from being sent, and the symptom would look like a session bug.
 *
 * The public path of the local image storage is not under it: an `imageUrl` is
 * absolute and points at this API's own host, never through the rewrite.
 */
export const API_GLOBAL_PREFIX = 'api';

/** Path of the liveness probe. */
export const HEALTH_ROUTE = 'health';

/**
 * Routes left outside the prefix. Only the liveness probe: the container's
 * `HEALTHCHECK` and the hosting platform's health check call `/health`, and
 * neither should have to change whenever the prefix does.
 */
export const UNPREFIXED_ROUTES: readonly string[] = [HEALTH_ROUTE];

/** Joins a prefix and route segments into an absolute path: `('api', 'auth')` is `/api/auth`. */
export function joinApiPath(prefix: string, ...segments: string[]): string {
  const parts = [prefix, ...segments]
    .flatMap((part) => part.split('/'))
    .filter((part) => part.length > 0);

  return `/${parts.join('/')}`;
}

/** The absolute path of a route, with the global prefix in front. */
export function apiPath(...segments: string[]): string {
  return joinApiPath(API_GLOBAL_PREFIX, ...segments);
}
