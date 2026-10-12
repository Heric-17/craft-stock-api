/**
 * The global route prefix of the API. Empty today: routes live at `/auth`,
 * `/sales` and so on.
 *
 * It is declared once, here, and applied to the app by `configureApp`, so that
 * anything that has to know where a route really lives asks this module
 * instead of repeating a literal. The refresh token cookie is the case that
 * matters: a browser only sends a cookie to paths under its `Path`, so a
 * literal that stopped matching the routes would silently stop the cookie
 * from being sent, and the symptom would look like a session bug.
 *
 * Giving the API a prefix means changing the constant below. The health check
 * the container declares and the public path of the local image storage are
 * not derived from it and have to be reviewed together with that change.
 */
export const API_GLOBAL_PREFIX = '';

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
