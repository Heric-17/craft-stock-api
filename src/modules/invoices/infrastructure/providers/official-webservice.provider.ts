import { Injectable, NotImplementedException } from '@nestjs/common';

import type { InvoiceProvider } from '../../domain/providers/invoice-provider';
import type { RawInvoice } from '../../domain/raw-invoice';

/**
 * The official SEFAZ webservice, as a future replacement for scraping.
 *
 * This is the evolution the scraping providers exist in place of. Consuming
 * the webservice returns the note's own XML, which would end the dependency
 * on portal markup entirely: no selectors to break, no page that might be a
 * captcha, and no `InvoiceStructureChangedError` class of failure at all. The
 * integrity checks against the reported item count and the header totals
 * would become redundant rather than load-bearing.
 *
 * It is not implemented because it requires an A1 digital certificate for the
 * company, which the current single-installation deployment does not have.
 * The day it does, this class is the only thing that changes: the contract,
 * the factory and every consumer stay exactly as they are.
 */
@Injectable()
export class OfficialWebserviceProvider implements InvoiceProvider {
  fetchInvoice(url: string): Promise<RawInvoice> {
    throw new NotImplementedException(
      `NFC-e import through the official SEFAZ webservice is not implemented yet (${url}). It requires a digital certificate for the company.`,
    );
  }
}
