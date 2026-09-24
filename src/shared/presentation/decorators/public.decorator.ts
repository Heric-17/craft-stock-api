import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Marks a route as reachable without a bearer token. The global guard checks
 * for this on every request; everything without it requires authentication.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
