import { Controller, Get, HttpCode, HttpStatus } from '@nestjs/common';

import { Public } from '../../../shared/presentation/decorators/public.decorator';

interface HealthResponse {
  status: 'ok';
  uptimeSeconds: number;
  timestamp: string;
}

/**
 * Liveness probe. Deliberately free of business rules and of any dependency
 * that could make the process look unhealthy while it is merely idle — the
 * exception is `@Public()`, since a probe that itself required a bearer
 * token would not be a liveness check.
 */
@Controller('health')
export class HealthController {
  @Public()
  @Get()
  @HttpCode(HttpStatus.OK)
  check(): HealthResponse {
    return {
      status: 'ok',
      uptimeSeconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  }
}
