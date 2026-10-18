import { Injectable, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  InjectThrottlerOptions,
  InjectThrottlerStorage,
  ThrottlerGuard,
  type ThrottlerLimitDetail,
  type ThrottlerModuleOptions,
  type ThrottlerStorage,
} from '@nestjs/throttler';
import type { Request } from 'express';

import { RateLimitExceededError } from '../../domain/errors/rate-limit-exceeded.error';
import { StructuredLogger } from '../../infrastructure/logging/structured-logger.service';

const LOG_CONTEXT = 'RateLimit';

/** The header is written by whoever calls, so it is cut before it reaches a log line. */
const MAX_LOGGED_HEADER_LENGTH = 300;

function truncate(header: string | string[] | undefined): string | undefined {
  return header === undefined
    ? undefined
    : [header].flat().join(', ').slice(0, MAX_LOGGED_HEADER_LENGTH);
}

/**
 * The throttler's guard, changed in the two places where the project's own
 * rules apply: the refusal is a domain error that the global filter renders in
 * the documented error shape, and it is logged here, where the client's
 * address and the route are at hand.
 *
 * Reaching the limit is an expected event and not a failure of ours, so it is
 * logged as a warning and never goes through the operational alert, which is
 * reserved for status 500 and above.
 */
@Injectable()
export class RateLimitGuard extends ThrottlerGuard {
  constructor(
    @InjectThrottlerOptions() options: ThrottlerModuleOptions,
    @InjectThrottlerStorage() storageService: ThrottlerStorage,
    reflector: Reflector,
    private readonly structuredLogger: StructuredLogger,
  ) {
    super(options, storageService, reflector);
  }

  protected override async throwThrottlingException(
    context: ExecutionContext,
    detail: ThrottlerLimitDetail,
  ): Promise<void> {
    const request = context.switchToHttp().getRequest<Request>();
    // The throttler already counts the wait in whole seconds, rounded up.
    const retryAfterSeconds = Math.max(1, detail.timeToBlockExpire);

    this.structuredLogger.warn(
      `Rate limit reached: ${request.method} ${request.originalUrl}`,
      {
        event: 'rate_limit_exceeded',
        route: (request.route as { path?: string } | undefined)?.path ?? request.originalUrl,
        method: request.method,
        ip: request.ip,
        // What `ip` was derived from, so a wrong `TRUST_PROXY` can be read off
        // the log instead of guessed at: the chain the proxies built, the
        // address of the connection itself, and the count in force.
        forwardedFor: truncate(request.headers['x-forwarded-for']),
        socketAddress: request.socket.remoteAddress,
        trustProxy: request.app.get('trust proxy') as unknown,
        limit: detail.limit,
        windowMs: detail.ttl,
        retryAfterSeconds,
      },
      LOG_CONTEXT,
    );

    return Promise.reject(
      new RateLimitExceededError({
        retryAfterSeconds,
        retryAt: new Date(Date.now() + retryAfterSeconds * 1_000).toISOString(),
      }),
    );
  }
}
