import type { Money } from '../../../../shared/domain/money/money';
import { extractAccessKeyFromUrl } from '../federal-unit';
import type { RawInvoice } from '../raw-invoice';

export const REFERENCE_INVOICES = Symbol('REFERENCE_INVOICES');

/**
 * What a known note is supposed to extract to. Pinned in code, never read
 * from the database: the point of the canary is to notice that the portal
 * stopped agreeing with what the scraper was written against, and a value
 * that travels with the note it describes can drift along with it.
 *
 * Only three fields are compared, and deliberately so. They are the ones that
 * fail differently from each other — a heading, an amount and a count — so
 * between them they cover the merchant block, the totals block and the item
 * table. Comparing every field would turn the canary into a second copy of
 * the scraper's own test suite, which already runs against the fixtures.
 */
export interface ReferenceInvoiceExpectation {
  /**
   * The note's own 44-digit access key. This is what pairs these values with
   * a URL from configuration: the key travels inside the URL, so neither side
   * depends on the other's ordering and a URL cannot be checked against the
   * wrong expectations.
   */
  accessKey: string;
  /** Short human name for the alert body — which purchase this is, and when. */
  label: string;
  merchantName: string;
  /** Sum of the lines at full price, which is the total the note prints. */
  grossTotal: Money;
  itemCount: number;
}

export type ReferenceInvoiceField = 'merchantName' | 'grossTotal' | 'itemCount';

/** One field that came back different, rendered for the alert. */
export interface ReferenceInvoiceMismatch {
  field: ReferenceInvoiceField;
  expected: string;
  actual: string;
}

export interface CanaryTarget {
  url: string;
  expectation: ReferenceInvoiceExpectation;
}

export interface CanaryTargets {
  targets: CanaryTarget[];
  /**
   * Configured URLs carrying no access key, or an access key nothing was
   * pinned for. Not a portal failure — a configuration one — so the canary
   * reports them and checks the rest.
   */
  unpairedUrls: string[];
}

/**
 * The configured list of reference URLs: separated by commas or whitespace,
 * so a value spread over several lines in an `.env` file reads the same as a
 * single line. Duplicates collapse, because the same note checked twice
 * would count twice towards "all of them failed".
 */
export function parseReferenceInvoiceUrls(raw: string): string[] {
  const urls = raw
    .split(/[\s,]+/)
    .map((url) => url.trim())
    .filter((url) => url.length > 0);

  return [...new Set(urls)];
}

/** Pairs each configured URL with the expectations pinned for the note it points at. */
export function resolveCanaryTargets(
  urls: readonly string[],
  expectations: readonly ReferenceInvoiceExpectation[],
): CanaryTargets {
  const targets: CanaryTarget[] = [];
  const unpairedUrls: string[] = [];

  for (const url of urls) {
    const accessKey = extractAccessKeyFromUrl(url);
    const expectation = expectations.find((candidate) => candidate.accessKey === accessKey);

    if (expectation === undefined) {
      unpairedUrls.push(url);
      continue;
    }

    targets.push({ url, expectation });
  }

  return { targets, unpairedUrls };
}

/**
 * Every pinned field that came back different. An empty array means the
 * portal still reads the way the scraper expects.
 *
 * The merchant name is compared with its whitespace collapsed: the portal
 * indents its own markup, and a line break moving inside a heading is not a
 * change worth waking anybody for.
 */
export function compareToReferenceInvoice(
  expectation: ReferenceInvoiceExpectation,
  invoice: RawInvoice,
): ReferenceInvoiceMismatch[] {
  const mismatches: ReferenceInvoiceMismatch[] = [];
  const merchantName = collapse(invoice.merchantName);
  const expectedMerchantName = collapse(expectation.merchantName);

  if (merchantName !== expectedMerchantName) {
    mismatches.push({
      field: 'merchantName',
      expected: expectedMerchantName,
      actual: merchantName,
    });
  }

  if (!invoice.grossTotal.equals(expectation.grossTotal)) {
    mismatches.push({
      field: 'grossTotal',
      expected: expectation.grossTotal.toDecimalString(),
      actual: invoice.grossTotal.toDecimalString(),
    });
  }

  // The lines actually extracted, not the count the note reports. The two are
  // already checked against each other while parsing, so what is left to
  // verify here is that the table still yields as many lines as it did.
  if (invoice.items.length !== expectation.itemCount) {
    mismatches.push({
      field: 'itemCount',
      expected: String(expectation.itemCount),
      actual: String(invoice.items.length),
    });
  }

  return mismatches;
}

function collapse(text: string): string {
  return text.replace(/[\s\u00a0]+/g, ' ').trim();
}
