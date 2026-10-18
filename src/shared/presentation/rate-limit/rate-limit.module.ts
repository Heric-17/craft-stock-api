import { Module, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';

import { EnvService } from '../../../config/env.service';
import { RATE_LIMIT_POLICY_KEY, type RateLimitPolicy } from '../decorators/rate-limit.decorator';
import { buildRateLimitBudgets } from './rate-limit-budget';
import { RateLimitGuard } from './rate-limit.guard';

/**
 * Per-IP rate limiting for the whole API.
 *
 * One throttler, with the budget resolved per route: a route that carries
 * `@RateLimit(...)` is held to that policy's budget, every other route to the
 * default one. Resolving it from the route's metadata, rather than declaring
 * one throttler per policy, keeps one counter per route and one set of
 * response headers, and a stricter budget is something a route opts into
 * instead of a second limit stacked on top of the first.
 *
 * Counters live in the memory of the process. The installation is a single
 * process (a restart clears them, which only ever favours the caller), and a
 * shared store would be a second moving part for a limit that exists to stop
 * a script, not to keep exact books.
 *
 * The liveness probe opts out with `@SkipThrottle()`.
 */
@Module({
  imports: [
    ThrottlerModule.forRootAsync({
      inject: [EnvService, Reflector],
      useFactory: (env: EnvService, reflector: Reflector) => {
        const budgets = buildRateLimitBudgets({
          RATE_LIMIT_DEFAULT_LIMIT: env.get('RATE_LIMIT_DEFAULT_LIMIT'),
          RATE_LIMIT_DEFAULT_WINDOW_SECONDS: env.get('RATE_LIMIT_DEFAULT_WINDOW_SECONDS'),
          RATE_LIMIT_AUTH_LIMIT: env.get('RATE_LIMIT_AUTH_LIMIT'),
          RATE_LIMIT_AUTH_WINDOW_SECONDS: env.get('RATE_LIMIT_AUTH_WINDOW_SECONDS'),
          RATE_LIMIT_RECOVERY_LIMIT: env.get('RATE_LIMIT_RECOVERY_LIMIT'),
          RATE_LIMIT_RECOVERY_WINDOW_SECONDS: env.get('RATE_LIMIT_RECOVERY_WINDOW_SECONDS'),
        });

        const budgetOf = (context: ExecutionContext) =>
          budgets[
            reflector.getAllAndOverride<RateLimitPolicy | undefined>(RATE_LIMIT_POLICY_KEY, [
              context.getHandler(),
              context.getClass(),
            ]) ?? 'DEFAULT'
          ];

        return {
          throttlers: [
            {
              name: 'default',
              limit: (context) => budgetOf(context).limit,
              ttl: (context) => budgetOf(context).windowMs,
            },
          ],
        };
      },
    }),
  ],
  providers: [RateLimitGuard],
  exports: [RateLimitGuard],
})
export class RateLimitModule {}
