import { Test } from '@nestjs/testing';

import { EnvModule } from '../../config/env.module';
import { LoggingModule } from '../../shared/infrastructure/logging/logging.module';
import { UNIT_OF_WORK } from '../../shared/domain/persistence/unit-of-work';
import { InvoiceImportFacade } from './application/facades/invoice-import.facade';
import { InvoiceClassificationService } from './application/services/invoice-classification.service';
import { PendingInvoicesService } from './application/services/pending-invoices.service';
import { DELAY } from './domain/ports/delay.port';
import { HTTP_CLIENT } from './domain/ports/http-client.port';
import {
  INVOICE_PROVIDER_FACTORY,
  type InvoiceProviderFactory,
} from './domain/providers/invoice-provider';
import { PENDING_INVOICE_REPOSITORY } from './domain/repositories/pending-invoice.repository';
import { FetchHttpClient } from './infrastructure/http/fetch-http-client';
import { ScrapingInvoiceProviderFactory } from './infrastructure/providers/invoice-provider.factory';
import { OfficialWebserviceProvider } from './infrastructure/providers/official-webservice.provider';
import { ScrapingRsProvider } from './infrastructure/providers/scraping-rs.provider';
import { ScrapingSpProvider } from './infrastructure/providers/scraping-sp.provider';
import { TimerDelay } from './infrastructure/time/timer-delay';
import { InvoicesController } from './presentation/invoices.controller';

/**
 * Builds the module's own providers through the real container, with the
 * database-backed ones stubbed out. It checks the wiring, which is where a
 * token mismatch or a missing registration would otherwise only show up at
 * runtime, on the first import someone tries.
 */
describe('InvoicesModule wiring', () => {
  it('resolves the facade, the factory and the controller through the container', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [EnvModule, LoggingModule],
      controllers: [InvoicesController],
      providers: [
        { provide: PENDING_INVOICE_REPOSITORY, useValue: {} },
        { provide: UNIT_OF_WORK, useValue: { runInTransaction: () => Promise.resolve(null) } },
        { provide: HTTP_CLIENT, useClass: FetchHttpClient },
        { provide: DELAY, useClass: TimerDelay },
        ScrapingRsProvider,
        ScrapingSpProvider,
        OfficialWebserviceProvider,
        { provide: INVOICE_PROVIDER_FACTORY, useClass: ScrapingInvoiceProviderFactory },
        InvoiceImportFacade,
        InvoiceClassificationService,
        PendingInvoicesService,
      ],
    }).compile();

    expect(moduleRef.get(InvoiceImportFacade)).toBeInstanceOf(InvoiceImportFacade);
    expect(moduleRef.get(InvoicesController)).toBeInstanceOf(InvoicesController);

    /**
     * The acceptance criterion for the Factory pattern: the factory hands
     * back the very instances the container built, never one of its own.
     */
    const factory = moduleRef.get<InvoiceProviderFactory>(INVOICE_PROVIDER_FACTORY);
    const rsUrl = 'https://x.gov.br/c?p=43260600000000000000000000000000000000000000';
    const spUrl = 'https://x.gov.br/c?p=35260600000000000000000000000000000000000000';

    expect(factory.create(rsUrl)).toBe(moduleRef.get(ScrapingRsProvider));
    expect(factory.create(spUrl)).toBe(moduleRef.get(ScrapingSpProvider));

    await moduleRef.close();
  });
});
