import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { EnvService } from '../../../../config/env.service';
import { RequestContextService } from '../../../../shared/infrastructure/logging/request-context.service';
import { StructuredLogger } from '../../../../shared/infrastructure/logging/structured-logger.service';
import { aggregateInvoiceItems } from '../../domain/invoice-item-aggregation';
import {
  HttpTransportError,
  InvoiceSourceUnavailableError,
  InvoiceStructureChangedError,
} from '../../domain/invoice.error';
import type { HttpClient, HttpResponse } from '../../domain/ports/http-client.port';
import { ScrapingRsProvider } from './scraping-rs.provider';

const FIXTURES = join(__dirname, '..', '..', '..', '..', '..', 'test', 'fixtures', 'nfce');

/**
 * Read straight off disk and never written to. Nothing in production touches
 * `test/fixtures/`: a fixture updated automatically would make the tests
 * validate the new markup and stay green, which is exactly the alarm this
 * suite exists to raise.
 */
function fixture(name: string): string {
  return readFileSync(join(FIXTURES, `${name}.html`), 'utf8');
}

const URL =
  'https://www.sefaz.rs.gov.br/NFCE/NFC-E-COM.aspx?p=43000000000000000000000000000000000000000000|2|1|1|abc';

function silentLogger(): StructuredLogger {
  const env = { get: () => 'error' } as unknown as EnvService;

  const logger = new StructuredLogger(env, new RequestContextService());
  jest.spyOn(logger, 'warn').mockImplementation(() => undefined);
  jest.spyOn(logger, 'error').mockImplementation(() => undefined);

  return logger;
}

/** An HTTP client that answers from a fixture, so nothing here touches the network. */
function clientReturning(response: Partial<HttpResponse> & { throws?: Error }): HttpClient {
  return {
    get: async (): Promise<HttpResponse> => {
      if (response.throws) {
        throw response.throws;
      }

      return Promise.resolve({ status: response.status ?? 200, body: response.body ?? '' });
    },
  };
}

function buildProvider(client: HttpClient): ScrapingRsProvider {
  return new ScrapingRsProvider(client, silentLogger());
}

describe('ScrapingRsProvider, against the complete note fixture', () => {
  const provider = buildProvider(clientReturning({}));
  const invoice = provider.parse(fixture('rs-nota-completa'), URL);

  it('reads the establishment and its CNPJ', () => {
    expect(invoice.merchantName).toBe('ATACADAO S.A.');
    expect(invoice.cnpj).toBe('75.315.333/0088-60');
  });

  it('reads the address', () => {
    expect(invoice.address).toContain('SERTORIO');
    expect(invoice.address).toContain('PORTO ALEGRE');
  });

  it('reads the 44-digit access key with its spacing removed', () => {
    expect(invoice.accessKey).toBe('43000000000000000000000000000000000000000000');
    expect(invoice.accessKey).toHaveLength(44);
  });

  it('reads the invoice number and series', () => {
    expect(invoice.invoiceNumber).toBe('1');
    expect(invoice.series).toBe('1');
  });

  it('reads the issue date as a Date, pinned to Brazilian civil time', () => {
    expect(invoice.issuedAt).toBeInstanceOf(Date);
    expect(invoice.issuedAt.toISOString()).toBe('2026-06-11T21:46:31.000Z');
  });

  it('reads every printed line, including the repeated ones', () => {
    expect(invoice.items).toHaveLength(12);
    expect(invoice.reportedItemCount).toBe(12);
  });

  it('reads a line with its code, description, quantity, unit and prices', () => {
    const [first] = invoice.items;

    expect(first.code).toBe('4424');
    expect(first.description).toBe('CHOC.NESTLE TRIO');
    expect(first.quantity).toBe(4);
    expect(first.unit).toBe('UND9');
    expect(first.unitPrice.toDecimalString()).toBe('9.49');
    expect(first.grossValue.toDecimalString()).toBe('37.96');
  });

  it('reads a weighed line with its fractional quantity', () => {
    const weighed = invoice.items[3];

    expect(weighed.description).toBe('QUEIJO AZUL DOR');
    expect(weighed.quantity).toBe(0.146);
    expect(weighed.unit).toBe('KG9');
    expect(weighed.grossValue.toDecimalString()).toBe('8.75');
  });

  it('reads the header totals as Money', () => {
    expect(invoice.grossTotal.toDecimalString()).toBe('336.35');
    expect(invoice.discountTotal.toDecimalString()).toBe('6.40');
    expect(invoice.netTotal.toDecimalString()).toBe('329.95');
    expect(invoice.taxTotal.toDecimalString()).toBe('63.75');
  });

  it('reads both payment methods', () => {
    expect(invoice.payments).toHaveLength(2);
    expect(invoice.payments[0].method).toBe('Cartão de Crédito');
    expect(invoice.payments[0].amount.toDecimalString()).toBe('255.90');
    expect(invoice.payments[1].amount.toDecimalString()).toBe('74.05');
  });

  /**
   * The page carries the CPF given at the till. It is deliberately never read
   * — not into the returned invoice, and so not into `rawInvoiceData` either.
   */
  it('does not extract the consumer CPF anywhere', () => {
    expect(fixture('rs-nota-completa')).toContain('CPF');
    expect(JSON.stringify(invoice)).not.toContain('000.000.000-00');
    expect(Object.keys(invoice)).not.toContain('cpf');
  });

  it('aggregates to eight distinct products from twelve printed lines', () => {
    const aggregated = aggregateInvoiceItems(invoice.items);

    expect(invoice.items).toHaveLength(12);
    expect(aggregated).toHaveLength(8);

    const cheese = aggregated.find((item) => item.code === '92342');
    expect(cheese?.lineCount).toBe(4);
    expect(cheese?.grossValue.toDecimalString()).toBe('29.36');
  });
});

describe('ScrapingRsProvider, against the single-item note fixture', () => {
  const provider = buildProvider(clientReturning({}));
  const invoice = provider.parse(fixture('rs-nota-item-unico'), URL);

  it('reads the one line', () => {
    expect(invoice.items).toHaveLength(1);
    expect(invoice.items[0].description).toBe('CALCADO COM MEIAS 15-16');
    expect(invoice.items[0].grossValue.toDecimalString()).toBe('46.99');
  });

  /**
   * This fixture has no "Valor total" and no "Descontos" line at all — the
   * portal prints them only when there is a discount. An absent line means
   * this note has no discount; it does not mean the total is zero. The
   * previous implementation returned zero for both.
   */
  it('reads a note whose header omits the gross total and the discount', () => {
    expect(invoice.discountTotal.toDecimalString()).toBe('0.00');
    expect(invoice.grossTotal.toDecimalString()).toBe('46.99');
    expect(invoice.netTotal.toDecimalString()).toBe('46.99');
    expect(invoice.grossTotal.isZero()).toBe(false);
  });

  it('reads a product code the portal broke across several lines of markup', () => {
    expect(invoice.items[0].code).toBe('023251');
  });

  it('reads a unit that carries no numeric suffix', () => {
    expect(invoice.items[0].unit).toBe('PC');
  });
});

describe('ScrapingRsProvider, against the discounted note fixture', () => {
  const provider = buildProvider(clientReturning({}));
  const invoice = provider.parse(fixture('rs-nota-com-desconto'), URL);

  it('reads all three header totals and they close', () => {
    expect(invoice.grossTotal.toDecimalString()).toBe('20.45');
    expect(invoice.discountTotal.toDecimalString()).toBe('0.80');
    expect(invoice.netTotal.toDecimalString()).toBe('19.65');
  });

  it('reads the lines, which add up to the gross total', () => {
    expect(invoice.items).toHaveLength(2);
    expect(
      invoice.items
        .reduce(
          (total, item) => total.plus(item.grossValue),
          invoice.items[0].grossValue.minus(invoice.items[0].grossValue),
        )
        .toDecimalString(),
    ).toBe('20.45');
  });
});

describe('ScrapingRsProvider, when the page is not a note', () => {
  /**
   * A 200 from these portals is not a promise of an invoice: an invalid key,
   * an expired session or a captcha all come back as a perfectly successful
   * response carrying an entirely different page.
   */
  it('refuses the error page before reading a single field', () => {
    const provider = buildProvider(clientReturning({}));

    expect(() => provider.parse(fixture('rs-nota-inexistente'), URL)).toThrow(
      InvoiceStructureChangedError,
    );
  });

  it('says which structural markers were missing', () => {
    const provider = buildProvider(clientReturning({}));

    expect(() => provider.parse(fixture('rs-nota-inexistente'), URL)).toThrow(/tabResult/);
  });

  it('refuses an empty body', () => {
    const provider = buildProvider(clientReturning({}));

    expect(() => provider.parse('', URL)).toThrow(InvoiceStructureChangedError);
  });
});

describe('ScrapingRsProvider integrity checks', () => {
  /**
   * The cheapest detection of the scraping having broken, and it fires before
   * a wrong value can reach stock.
   */
  it('refuses a note whose reported item count does not match what was extracted', () => {
    const tampered = fixture('rs-nota-completa').replace(
      '<label>Qtd. total de itens:</label><span class="totalNumb">12</span>',
      '<label>Qtd. total de itens:</label><span class="totalNumb">14</span>',
    );
    const provider = buildProvider(clientReturning({}));

    expect(() => provider.parse(tampered, URL)).toThrow(InvoiceStructureChangedError);
    expect(() => provider.parse(tampered, URL)).toThrow(/reports 14 items but 12 were extracted/);
  });

  it('refuses a note whose lines do not add up to its own total', () => {
    const tampered = fixture('rs-nota-com-desconto').replace(
      '<label>Valor total R$:</label><span class="totalNumb">20,45</span>',
      '<label>Valor total R$:</label><span class="totalNumb">25,45</span>',
    );
    const provider = buildProvider(clientReturning({}));

    expect(() => provider.parse(tampered, URL)).toThrow(InvoiceStructureChangedError);
  });

  /**
   * The correction that matters most: a value that cannot be read stops the
   * import instead of becoming a silent zero, which would contaminate
   * packageCost, unitCost and every suggested price downstream.
   */
  it('refuses a line whose price became unreadable, rather than reading it as zero', () => {
    const tampered = fixture('rs-nota-com-desconto').replace(
      '<span class="valor">11,16</span>',
      '<span class="valor">--</span>',
    );
    const provider = buildProvider(clientReturning({}));

    expect(() => provider.parse(tampered, URL)).toThrow(InvoiceStructureChangedError);
    expect(() => provider.parse(tampered, URL)).toThrow(/BISC\.STICK LOOK/);
  });

  it('refuses a note whose access key is not 44 digits', () => {
    const tampered = fixture('rs-nota-com-desconto').replace(
      /<span class="chave">[^<]*<\/span>/,
      '<span class="chave">4300 0000</span>',
    );
    const provider = buildProvider(clientReturning({}));

    expect(() => provider.parse(tampered, URL)).toThrow(/not 44 digits/);
  });
});

describe('ScrapingRsProvider transport failures', () => {
  /**
   * The other failure mode, and the one treated differently: there is no HTML
   * at all, so nothing can be said about the note. It is exercised by
   * simulating the injected HTTP client — no fixture is involved, because
   * there is no page.
   */
  it('reports a dropped connection as the source being unavailable', async () => {
    const provider = buildProvider(
      clientReturning({ throws: new HttpTransportError('socket hang up') }),
    );

    await expect(provider.fetchInvoice(URL)).rejects.toThrow(InvoiceSourceUnavailableError);
  });

  it('reports a timeout as the source being unavailable', async () => {
    const provider = buildProvider(
      clientReturning({ throws: new HttpTransportError('The operation was aborted') }),
    );

    await expect(provider.fetchInvoice(URL)).rejects.toThrow(InvoiceSourceUnavailableError);
  });

  it('reports a 503 from the portal as the source being unavailable', async () => {
    const provider = buildProvider(clientReturning({ status: 503, body: '' }));

    await expect(provider.fetchInvoice(URL)).rejects.toThrow(InvoiceSourceUnavailableError);
  });

  /**
   * A 4xx is not transient. Treating it as an unavailable source would retry
   * it three times for nothing and then park the capture as UNSTABLE, which
   * claims the portal is down when the portal answered perfectly well.
   */
  it.each([404, 400, 403])('does not treat a %s as the portal being down', async (status) => {
    const provider = buildProvider(clientReturning({ status, body: '' }));

    await expect(provider.fetchInvoice(URL)).rejects.toThrow(InvoiceStructureChangedError);
    await expect(provider.fetchInvoice(URL)).rejects.not.toThrow(InvoiceSourceUnavailableError);
  });

  /**
   * The distinction that drives the whole retry policy: a 200 carrying the
   * wrong page is our problem, not the portal's, and retrying it is pointless.
   */
  it('separates a 200 that is not a note from the portal being down', async () => {
    const provider = buildProvider(
      clientReturning({ status: 200, body: fixture('rs-nota-inexistente') }),
    );

    await expect(provider.fetchInvoice(URL)).rejects.toThrow(InvoiceStructureChangedError);
    await expect(provider.fetchInvoice(URL)).rejects.not.toThrow(InvoiceSourceUnavailableError);
  });

  it('reads a real note end to end through the injected client', async () => {
    const provider = buildProvider(
      clientReturning({ status: 200, body: fixture('rs-nota-completa') }),
    );

    const invoice = await provider.fetchInvoice(URL);

    expect(invoice.merchantName).toBe('ATACADAO S.A.');
    expect(invoice.items).toHaveLength(12);
  });
});
