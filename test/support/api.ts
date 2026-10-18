import type { Server } from 'node:http';

import request from 'supertest';

import { API_GLOBAL_PREFIX, joinApiPath } from '../../src/shared/presentation/http/api-prefix';

// `/api`, or nothing at all when the prefix is empty (`joinApiPath` alone would give `/`).
const PREFIX = joinApiPath(API_GLOBAL_PREFIX).replace(/\/$/, '');

/**
 * The path a route really lives at: `apiRoute('/materials?limit=3')` is
 * `/api/materials?limit=3`. Plain concatenation, so a query string is sent
 * exactly as written.
 */
export function apiRoute(path: string): string {
  return `${PREFIX}${path}`;
}

/**
 * `request(server)` for the business routes, with the global prefix in front
 * of every path. The specs name a route as the controller declares it and
 * this puts it where `configureApp` mounted it, so changing the prefix never
 * means rewriting them.
 *
 * Routes outside the prefix (`/health`, the static `/uploads`, a route that
 * does not exist) go through plain `request(server)`.
 */
export function api(server: Server) {
  const agent = request(server);

  return {
    get: (path: string): request.Test => agent.get(apiRoute(path)),
    post: (path: string): request.Test => agent.post(apiRoute(path)),
    put: (path: string): request.Test => agent.put(apiRoute(path)),
    patch: (path: string): request.Test => agent.patch(apiRoute(path)),
    delete: (path: string): request.Test => agent.delete(apiRoute(path)),
    options: (path: string): request.Test => agent.options(apiRoute(path)),
  };
}
