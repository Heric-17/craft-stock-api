import { Money } from '../../../../shared/domain/money/money';
import type { ReferenceInvoiceExpectation } from './reference-invoice';

/**
 * The reference notes this installation watches, and what each one has to
 * extract to.
 *
 * Filled in by hand, once, from a note that really was imported. The URL of
 * each note goes into `NFCE_CANARY_URLS`, and the access key inside that URL is
 * what pairs it with the entry below.
 *
 * `merchantName`, `accessKey` and `grossTotal` are the import's own
 * `merchantName`, `accessKey` and `grossTotal`, copied as they came.
 * `itemCount` is the "Qtd. total de itens" of the portal's own consultation
 * page: how many LINES it printed. It is neither how many units were sold —
 * three loaves on one line count once here — nor how many lines the import
 * shows, since lines sharing a product code are merged on the way to the user.
 * It is the number the page declares about itself, and the one the scraper
 * already checks its extraction against, so a wrong value here diverges on the
 * very first run.
 *
 * Pin two or three notes issued on clearly different dates. The public
 * consultation of an NFC-e does not stay up forever, so a single note going
 * quiet says nothing about the portal — it is only when every one of them
 * fails on the same day that the scraping itself is the likely cause. With
 * one note pinned there is nothing to compare against, and the canary says so
 * on every run.
 *
 * Emptying this list disables the canary, which is the right state for a
 * development machine and for the test suite.
 */
export const PINNED_REFERENCE_INVOICES: readonly ReferenceInvoiceExpectation[] = [
  {
    accessKey: '43260707221167000121651010000521081370214010',
    label: 'Cestas e Cestas, July 2026',
    merchantName: 'CESTAS E CESTAS LTDA',
    grossTotal: Money.fromDecimalString('26.90'),
    itemCount: 1,
  },
  {
    accessKey: '43260975315333008860655010009205801048579171',
    label: 'Atacadão, September 2026',
    merchantName: 'ATACADAO S.A.',
    grossTotal: Money.fromDecimalString('125.16'),
    itemCount: 19,
  },
];
