import type { RawInvoice } from '../raw-invoice';

export const INVOICE_PROVIDER_FACTORY = Symbol('INVOICE_PROVIDER_FACTORY');

/**
 * Where the data behind an NFC-e comes from. One contract, several origins:
 * the public consultation page of each state portal today, the official
 * webservice one day.
 *
 * Retrying is not part of this contract. A provider makes exactly one attempt
 * and reports what happened; deciding that a `InvoiceSourceUnavailableError`
 * is worth a second try, and how long to wait first, belongs to the flow that
 * orchestrates the import, not to the thing that reads the page.
 */
export interface InvoiceProvider {
  /**
   * @throws InvoiceSourceUnavailableError when the source did not answer.
   * @throws InvoiceStructureChangedError when it answered with something that is not a note.
   */
  fetchInvoice(url: string): Promise<RawInvoice>;
}

/**
 * Picks the provider for a capture. Implemented in `infrastructure/`, where
 * the concrete providers live; consumers only ever see this interface and the
 * `InvoiceProvider` it hands back.
 */
export interface InvoiceProviderFactory {
  /** @throws UnsupportedFederalUnitError when no provider covers the URL's state. */
  create(url: string): InvoiceProvider;
}
