import { Module } from '@nestjs/common';

import { REQUEST_LOG_WRITER } from '../../domain/observability/request-log-writer.port';
import { LoggingModule } from '../logging/logging.module';
import { RequestContextService } from '../logging/request-context.service';
import { createAuditExtension } from './audit/audit.extension';
import { PrismaService } from './prisma.service';
import { PRISMA_CLIENT } from './prisma-client.token';
import { PrismaRequestLogWriter } from './prisma-request-log-writer';
import { PrismaTransactionContextService } from './prisma-transaction-context.service';

/**
 * Infrastructure module that encapsulates database access. Only modules whose
 * `infrastructure/` layer implements a repository should import it.
 */
@Module({
  imports: [LoggingModule],
  providers: [
    PrismaService,
    PrismaTransactionContextService,
    {
      provide: PRISMA_CLIENT,
      useFactory: (
        prisma: PrismaService,
        requestContext: RequestContextService,
        txContext: PrismaTransactionContextService,
      ) => {
        // `getFallbackClient` is resolved lazily: the extension needs to
        // reference "the client this extension produces" from inside its own
        // definition, which doesn't exist yet while `$extends` is building it.
        let client: unknown;
        const extension = createAuditExtension(requestContext, txContext, () => client as never);
        client = prisma.$extends(extension);
        return client;
      },
      inject: [PrismaService, RequestContextService, PrismaTransactionContextService],
    },
    { provide: REQUEST_LOG_WRITER, useClass: PrismaRequestLogWriter },
  ],
  exports: [PrismaService, PrismaTransactionContextService, PRISMA_CLIENT, REQUEST_LOG_WRITER],
})
export class PrismaModule {}
