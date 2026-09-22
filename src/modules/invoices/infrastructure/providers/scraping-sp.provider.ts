import { Inject, Injectable, NotImplementedException } from '@nestjs/common';

import { HTTP_CLIENT, type HttpClient } from '../../domain/ports/http-client.port';
import type { InvoiceProvider } from '../../domain/providers/invoice-provider';
import type { RawInvoice } from '../../domain/raw-invoice';

/**
 * São Paulo's consultation portal. Deliberately a skeleton: it is wired into
 * the factory and holds the dependency it will need, so adding it later is
 * writing one method rather than threading a new implementation through
 * module, factory and tests.
 *
 * What it will take: the SP portal serves the same kind of page as RS, but
 * with its own markup, so the work is a second set of selectors behind the
 * same `InvoiceProvider` contract. The pieces that are not portal-specific —
 * Brazilian number parsing, unit normalisation, aggregation by product code,
 * the item-count integrity check — are already domain functions and are meant
 * to be reused here rather than reimplemented.
 */
@Injectable()
export class ScrapingSpProvider implements InvoiceProvider {
  constructor(@Inject(HTTP_CLIENT) private readonly http: HttpClient) {}

  fetchInvoice(url: string): Promise<RawInvoice> {
    void this.http;

    throw new NotImplementedException(
      `NFC-e import from the São Paulo portal is not implemented yet (${url}). Only Rio Grande do Sul is supported.`,
    );
  }
}
