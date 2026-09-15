import { Global, Module } from '@nestjs/common';

import { RequestContextService } from './request-context.service';
import { StructuredLogger } from './structured-logger.service';

/**
 * Logging is cross-cutting: exported globally so no module has to import it
 * explicitly to be able to log.
 */
@Global()
@Module({
  providers: [RequestContextService, StructuredLogger],
  exports: [RequestContextService, StructuredLogger],
})
export class LoggingModule {}
