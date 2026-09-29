import { Money } from '../../../../shared/domain/money/money';
import type { RawInvoice } from '../raw-invoice';
import {
  compareToReferenceInvoice,
  parseReferenceInvoiceUrls,
  resolveCanaryTargets,
  type ReferenceInvoiceExpectation,
} from './reference-invoice';

const ACCESS_KEY = '43000000000000000000000000000000000000000000';
const OTHER_ACCESS_KEY = '43000000000000000000000000000000000000000003';

function expectation(
  overrides: Partial<ReferenceInvoiceExpectation> = {},
): ReferenceInvoiceExpectation {
  return {
    accessKey: ACCESS_KEY,
    label: 'Atacadão, June 2026',
    merchantName: 'ATACADAO S.A.',
    grossTotal: Money.fromDecimalString('336.35'),
    itemCount: 12,
    ...overrides,
  };
}

/** Only the three fields the canary compares matter here. */
function invoice(overrides: Partial<RawInvoice> = {}): RawInvoice {
  return {
    merchantName: 'ATACADAO S.A.',
    grossTotal: Money.fromDecimalString('336.35'),
    items: Array.from({ length: 12 }, () => ({
      code: '1',
      description: 'ITEM',
      quantity: 1,
      unit: 'UND9',
      unitPrice: Money.fromDecimalString('1.00'),
      grossValue: Money.fromDecimalString('1.00'),
    })),
    cnpj: '75.315.333/0088-60',
    address: 'PORTO ALEGRE',
    invoiceNumber: '1',
    series: '1',
    issuedAt: new Date('2026-06-12T09:51:46-03:00'),
    accessKey: ACCESS_KEY,
    discountTotal: Money.zero(),
    netTotal: Money.fromDecimalString('336.35'),
    taxTotal: Money.zero(),
    reportedItemCount: 12,
    payments: [],
    ...overrides,
  };
}

describe('compareToReferenceInvoice', () => {
  it('reports nothing when the note reads exactly as pinned', () => {
    expect(compareToReferenceInvoice(expectation(), invoice())).toEqual([]);
  });

  it('reports the merchant name when it changed', () => {
    const mismatches = compareToReferenceInvoice(
      expectation(),
      invoice({ merchantName: 'ATACADAO S/A - FILIAL 88' }),
    );

    expect(mismatches).toEqual([
      { field: 'merchantName', expected: 'ATACADAO S.A.', actual: 'ATACADAO S/A - FILIAL 88' },
    ]);
  });

  it('reports the gross total when it changed', () => {
    const mismatches = compareToReferenceInvoice(
      expectation(),
      invoice({ grossTotal: Money.fromDecimalString('336.36') }),
    );

    expect(mismatches).toEqual([{ field: 'grossTotal', expected: '336.35', actual: '336.36' }]);
  });

  it('reports the item count when fewer lines were extracted', () => {
    const mismatches = compareToReferenceInvoice(
      expectation(),
      invoice({ items: invoice().items.slice(0, 11) }),
    );

    expect(mismatches).toEqual([{ field: 'itemCount', expected: '12', actual: '11' }]);
  });

  it('counts the lines it extracted, not the count the note reports', () => {
    // The two are already cross-checked while parsing. If they somehow
    // disagreed here, the lines are what would reach stock.
    const mismatches = compareToReferenceInvoice(
      expectation({ itemCount: 11 }),
      invoice({ items: invoice().items.slice(0, 11), reportedItemCount: 12 }),
    );

    expect(mismatches).toEqual([]);
  });

  it('ignores whitespace the portal introduced into the merchant name', () => {
    expect(
      compareToReferenceInvoice(expectation(), invoice({ merchantName: '  ATACADAO\n  S.A. ' })),
    ).toEqual([]);
  });

  it('reports every field that changed at once', () => {
    const mismatches = compareToReferenceInvoice(
      expectation(),
      invoice({
        merchantName: 'OUTRO MERCADO LTDA',
        grossTotal: Money.fromDecimalString('46.99'),
        items: invoice().items.slice(0, 1),
      }),
    );

    expect(mismatches.map((mismatch) => mismatch.field)).toEqual([
      'merchantName',
      'grossTotal',
      'itemCount',
    ]);
  });
});

describe('parseReferenceInvoiceUrls', () => {
  it('is empty when nothing is configured', () => {
    expect(parseReferenceInvoiceUrls('')).toEqual([]);
    expect(parseReferenceInvoiceUrls('   ')).toEqual([]);
  });

  it('splits on commas and on whitespace alike', () => {
    expect(parseReferenceInvoiceUrls('https://a/1, https://b/2\n  https://c/3')).toEqual([
      'https://a/1',
      'https://b/2',
      'https://c/3',
    ]);
  });

  it('collapses a URL listed twice', () => {
    // The same note checked twice would count twice towards "all of them failed".
    expect(parseReferenceInvoiceUrls('https://a/1,https://a/1')).toEqual(['https://a/1']);
  });
});

describe('resolveCanaryTargets', () => {
  const urlFor = (accessKey: string): string =>
    `https://www.sefaz.rs.gov.br/NFCE/NFC-E-COM.aspx?p=${accessKey}|2|1|1|abc`;

  it('pairs each URL with the note pinned for the access key it carries', () => {
    const first = expectation();
    const second = expectation({ accessKey: OTHER_ACCESS_KEY, label: 'Picolino, June 2026' });

    // Deliberately in the opposite order to the pinned list: the pairing is by
    // access key, never by position.
    const { targets, unpairedUrls } = resolveCanaryTargets(
      [urlFor(OTHER_ACCESS_KEY), urlFor(ACCESS_KEY)],
      [first, second],
    );

    expect(unpairedUrls).toEqual([]);
    expect(targets).toEqual([
      { url: urlFor(OTHER_ACCESS_KEY), expectation: second },
      { url: urlFor(ACCESS_KEY), expectation: first },
    ]);
  });

  it('reports a URL whose note was never pinned instead of checking it', () => {
    const { targets, unpairedUrls } = resolveCanaryTargets(
      [urlFor(OTHER_ACCESS_KEY)],
      [expectation()],
    );

    expect(targets).toEqual([]);
    expect(unpairedUrls).toEqual([urlFor(OTHER_ACCESS_KEY)]);
  });

  it('reports a URL carrying no access key at all', () => {
    const { targets, unpairedUrls } = resolveCanaryTargets(
      ['https://www.sefaz.rs.gov.br/NFCE/NFC-E-COM.aspx'],
      [expectation()],
    );

    expect(targets).toEqual([]);
    expect(unpairedUrls).toHaveLength(1);
  });
});
