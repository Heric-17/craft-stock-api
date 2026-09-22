import { Module } from '@nestjs/common';

import { EnvModule } from '../../config/env.module';
import { LoggingModule } from '../../shared/infrastructure/logging/logging.module';
import { PrismaModule } from '../../shared/infrastructure/prisma/prisma.module';
import { UnitOfWorkModule } from '../../shared/infrastructure/persistence/unit-of-work.module';
import { InvoiceImportFacade } from './application/facades/invoice-import.facade';
import { InvoiceClassificationService } from './application/services/invoice-classification.service';
import { PendingInvoicesService } from './application/services/pending-invoices.service';
import { DELAY } from './domain/ports/delay.port';
import { HTTP_CLIENT } from './domain/ports/http-client.port';
import { INVOICE_PROVIDER_FACTORY } from './domain/providers/invoice-provider';
import { PENDING_INVOICE_REPOSITORY } from './domain/repositories/pending-invoice.repository';
import { FetchHttpClient } from './infrastructure/http/fetch-http-client';
import { PrismaPendingInvoiceRepository } from './infrastructure/persistence/prisma-pending-invoice.repository';
import { ScrapingInvoiceProviderFactory } from './infrastructure/providers/invoice-provider.factory';
import { OfficialWebserviceProvider } from './infrastructure/providers/official-webservice.provider';
import { ScrapingRsProvider } from './infrastructure/providers/scraping-rs.provider';
import { ScrapingSpProvider } from './infrastructure/providers/scraping-sp.provider';
import { InvoicesController } from './presentation/invoices.controller';
import { TimerDelay } from './infrastructure/time/timer-delay';

@Module({
  imports: [EnvModule, LoggingModule, PrismaModule, UnitOfWorkModule],
  controllers: [InvoicesController],
  providers: [
    { provide: PENDING_INVOICE_REPOSITORY, useClass: PrismaPendingInvoiceRepository },
    { provide: HTTP_CLIENT, useClass: FetchHttpClient },
    { provide: DELAY, useClass: TimerDelay },
    // Every provider is registered so the container builds each one with its
    // own dependencies. The factory receives them and only ever selects — it
    // never constructs one itself, which would put the chosen implementation
    // outside the container along with everything injected into it.
    ScrapingRsProvider,
    ScrapingSpProvider,
    OfficialWebserviceProvider,
    { provide: INVOICE_PROVIDER_FACTORY, useClass: ScrapingInvoiceProviderFactory },
    InvoiceImportFacade,
    InvoiceClassificationService,
    PendingInvoicesService,
  ],
  exports: [PENDING_INVOICE_REPOSITORY, INVOICE_PROVIDER_FACTORY, InvoiceImportFacade],
})
export class InvoicesModule {}
