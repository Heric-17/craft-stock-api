import { Inject, Injectable } from '@nestjs/common';
import * as cheerio from 'cheerio';
import type { CheerioAPI } from 'cheerio';

import { Money } from '../../../../shared/domain/money/money';
import { StructuredLogger } from '../../../../shared/infrastructure/logging/structured-logger.service';
import {
  parseBrazilianDecimal,
  parseBrazilianQuantity,
  parseInteger,
} from '../../domain/brazilian-number';
import {
  HttpTransportError,
  InvoiceSourceUnavailableError,
  InvoiceStructureChangedError,
} from '../../domain/invoice.error';
import { normalizeInvoiceUnit } from '../../domain/invoice-unit';
import { HTTP_CLIENT, type HttpClient } from '../../domain/ports/http-client.port';
import type { InvoiceProvider } from '../../domain/providers/invoice-provider';
import type { RawInvoice, RawInvoiceItem, RawInvoicePayment } from '../../domain/raw-invoice';

/**
 * Markers that must all be on the page before a single field is read. A 200
 * from these portals is not a promise of a note: an invalid key, an expired
 * session or a captcha all come back as a perfectly successful response
 * carrying a completely different page. Checking first is what keeps the
 * scraper from "successfully" extracting a note made entirely of blanks.
 */
const STRUCTURAL_MARKERS = ['#conteudo', 'table#tabResult', '#totalNota', '.chave'] as const;

const ACCESS_KEY_PATTERN = /^\d{44}$/;
const ITEM_ROWS = 'table#tabResult tr[id^="Item"]';
const ISSUED_AT = /Emiss[ãa]o:\s*(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2}):(\d{2})/;
const INVOICE_NUMBER = /N[úu]mero:\s*(\d+)/;
const SERIES = /S[ée]rie:\s*(\d+)/;
/** `.` does not cross a newline, and the portal does break this cell across lines. */
const PRODUCT_CODE = /C[óo]digo:\s*([\s\S]+?)\s*\)/;

/**
 * Reads an NFC-e off the Rio Grande do Sul portal's public consultation page.
 *
 * The selectors are not invented here: they are the ones the previous system
 * used against this same portal, already proven in production. What changed
 * is what happens when one of them finds nothing — see `requireMoney`.
 *
 * There is no retrying in this class. It makes one attempt and reports what
 * it found; deciding whether an unavailable portal is worth another try
 * belongs to the flow that orchestrates the import.
 *
 * The consumer's CPF is on this page and is deliberately not read. It is not
 * extracted, not returned, and so never reaches `rawInvoiceData` either.
 */
@Injectable()
export class ScrapingRsProvider implements InvoiceProvider {
  constructor(
    @Inject(HTTP_CLIENT) private readonly http: HttpClient,
    private readonly logger: StructuredLogger,
  ) {}

  async fetchInvoice(url: string): Promise<RawInvoice> {
    const response = await this.fetchPage(url);

    // A 5xx is the portal failing at its own end, which is transient by
    // nature and worth another attempt.
    if (response.status >= 500) {
      throw new InvoiceSourceUnavailableError(
        `The RS portal answered ${response.status} for ${url}.`,
        1,
      );
    }

    // Anything else it answered is not transient. A 404 means it served no
    // invoice page at all — the note is not there, or the portal moved this
    // endpoint — and asking again will return the same 404. Reporting it as
    // an unavailable source would retry it three times for nothing and then
    // park the capture as UNSTABLE, which says the portal is down when the
    // portal answered perfectly well.
    if (response.status !== 200) {
      throw new InvoiceStructureChangedError(
        `The RS portal answered ${response.status} for ${url}, so it served no invoice page. Either the note is not there or the portal moved this endpoint.`,
        url,
      );
    }

    return this.parse(response.body, url);
  }

  private async fetchPage(url: string): Promise<{ status: number; body: string }> {
    try {
      return await this.http.get(url);
    } catch (cause) {
      if (cause instanceof HttpTransportError) {
        throw new InvoiceSourceUnavailableError(
          `The RS portal could not be reached: ${cause.message}`,
          1,
        );
      }

      throw cause;
    }
  }

  /** Exposed for the fixture-driven tests, which never go near the network. */
  parse(html: string, url: string | null = null): RawInvoice {
    const $ = cheerio.load(html);

    this.assertIsInvoicePage($, url);

    const items = this.extractItems($, url);
    const reportedItemCount = this.extractReportedItemCount($, url);

    // The cheapest possible detection of the scraping having broken, and it
    // fires before a single wrong value can reach stock: the note states how
    // many lines it has, and we state how many we managed to read.
    if (items.length !== reportedItemCount) {
      throw new InvoiceStructureChangedError(
        `The invoice reports ${reportedItemCount} items but ${items.length} were extracted. The portal markup has probably changed.`,
        url,
      );
    }

    const totals = this.extractTotals($, url, items);
    const accessKey = this.extractAccessKey($, url);

    return {
      merchantName: this.extractMerchantName($, url),
      cnpj: this.extractCnpj($, url),
      address: this.extractAddress($),
      invoiceNumber: this.matchInGeneralInfo($, INVOICE_NUMBER, 'Número', url),
      series: this.matchInGeneralInfo($, SERIES, 'Série', url),
      issuedAt: this.extractIssuedAt($, url),
      accessKey,
      grossTotal: totals.grossTotal,
      discountTotal: totals.discountTotal,
      netTotal: totals.netTotal,
      taxTotal: totals.taxTotal,
      reportedItemCount,
      payments: this.extractPayments($, url),
      items,
    };
  }

  private assertIsInvoicePage($: CheerioAPI, url: string | null): void {
    const missing = STRUCTURAL_MARKERS.filter((marker) => $(marker).length === 0);

    if (missing.length > 0) {
      throw new InvoiceStructureChangedError(
        `The page returned by the RS portal is not an invoice: the markers ${missing.join(', ')} are absent. It may be an error page, a captcha, or the portal markup may have changed.`,
        url,
      );
    }

    if ($(ITEM_ROWS).length === 0) {
      throw new InvoiceStructureChangedError(
        'The page returned by the RS portal carries no invoice lines.',
        url,
      );
    }
  }

  private extractMerchantName($: CheerioAPI, url: string | null): string {
    const name = collapse($('#u20, .txtTopo').first().text());

    if (name.length === 0) {
      throw new InvoiceStructureChangedError('The invoice carries no merchant name.', url);
    }

    return name;
  }

  private extractCnpj($: CheerioAPI, url: string | null): string {
    const raw = $('.text')
      .filter((_, element) => $(element).text().includes('CNPJ:'))
      .first()
      .text();

    const cnpj = raw
      .replace('CNPJ:', '')
      .replace(/[\s\u00a0]/g, '')
      .trim();

    if (cnpj.length === 0) {
      throw new InvoiceStructureChangedError('The invoice carries no CNPJ.', url);
    }

    return cnpj;
  }

  private extractAddress($: CheerioAPI): string {
    return $('.text')
      .filter((_, element) => !$(element).text().includes('CNPJ:'))
      .map((_, element) => collapse($(element).text()))
      .get()
      .filter((line) => line.length > 0)
      .join(', ');
  }

  /** The block carrying "Número", "Série" and "Emissão" on one line of text. */
  private generalInfo($: CheerioAPI): string {
    return collapse(
      $('li')
        .filter((_, element) => $(element).text().includes('Número:'))
        .first()
        .text(),
    );
  }

  private matchInGeneralInfo(
    $: CheerioAPI,
    pattern: RegExp,
    field: string,
    url: string | null,
  ): string {
    const match = pattern.exec(this.generalInfo($));

    if (!match) {
      throw new InvoiceStructureChangedError(
        `The invoice carries no readable "${field}" in its general information block.`,
        url,
      );
    }

    return match[1];
  }

  /**
   * The portal prints the issue instant in Brazilian civil time with no zone
   * attached. It is pinned to -03:00 rather than read in the server's own
   * zone, so the same note yields the same instant wherever the process runs.
   */
  private extractIssuedAt($: CheerioAPI, url: string | null): Date {
    const match = ISSUED_AT.exec(this.generalInfo($));

    if (!match) {
      throw new InvoiceStructureChangedError('The invoice carries no readable issue date.', url);
    }

    const [, day, month, year, hour, minute, second] = match;
    const issuedAt = new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}-03:00`);

    if (Number.isNaN(issuedAt.getTime())) {
      throw new InvoiceStructureChangedError(
        `The invoice reports an issue date of "${match[0]}", which is not a real date.`,
        url,
      );
    }

    return issuedAt;
  }

  private extractAccessKey($: CheerioAPI, url: string | null): string {
    const accessKey = $('.chave')
      .first()
      .text()
      .replace(/[\s\u00a0]/g, '')
      .trim();

    if (!ACCESS_KEY_PATTERN.test(accessKey)) {
      throw new InvoiceStructureChangedError(
        `The invoice access key "${accessKey}" is not 44 digits.`,
        url,
      );
    }

    return accessKey;
  }

  private extractItems($: CheerioAPI, url: string | null): RawInvoiceItem[] {
    const items: RawInvoiceItem[] = [];

    $(ITEM_ROWS).each((_, row) => {
      const cells = $(row).find('td');
      const description = collapse(cells.first().find('.txtTit').first().text());

      if (description.length === 0) {
        throw new InvoiceStructureChangedError('An invoice line carries no description.', url);
      }

      const codeMatch = PRODUCT_CODE.exec(collapse(cells.first().find('.RCod').text()));

      if (!codeMatch) {
        throw new InvoiceStructureChangedError(
          `Invoice line "${description}" carries no product code.`,
          url,
        );
      }

      const rawUnit = collapse(cells.first().find('.RUN').text()).replace(/^UN:\s*/, '');
      const unit = normalizeInvoiceUnit(rawUnit);

      // A unit we do not recognise is passed through as printed and reported,
      // never dropped: a silently discarded suffix would hide a portal change
      // behind a field that still looks plausible.
      if (!unit.recognized && unit.raw.length > 0) {
        this.logger.warn(
          `Unrecognised NFC-e unit "${unit.raw}" on line "${description}". It is shown to the user exactly as printed.`,
          ScrapingRsProvider.name,
        );
      }

      items.push({
        code: codeMatch[1].trim(),
        description,
        quantity: this.requireQuantity(
          collapse(cells.first().find('.Rqtd').text()).replace(/^Qtde\.?:\s*/, ''),
          `quantity of line "${description}"`,
          url,
        ),
        unit: unit.raw,
        unitPrice: this.requireMoney(
          collapse(cells.first().find('.RvlUnit').text()).replace(/^Vl\.\s*Unit\.?:\s*/, ''),
          `unit price of line "${description}"`,
          url,
        ),
        grossValue: this.requireMoney(
          cells.last().find('.valor').text(),
          `total of line "${description}"`,
          url,
        ),
      });
    });

    return items;
  }

  private extractReportedItemCount($: CheerioAPI, url: string | null): number {
    const raw = this.totalByLabel($, 'Qtd. total de itens');

    if (raw === null) {
      throw new InvoiceStructureChangedError(
        'The invoice does not report its own item count, so the extraction cannot be verified.',
        url,
      );
    }

    const count = parseInteger(raw);

    if (count === null) {
      throw new InvoiceStructureChangedError(
        `The invoice reports an item count of "${raw}", which is not a number.`,
        url,
      );
    }

    return count;
  }

  /**
   * The header totals.
   *
   * "Valor total" and "Descontos" are printed only when there is a discount —
   * a note without one shows "Valor a pagar" alone. So an absent line is read
   * as "this note has no discount", while a line that is present and
   * unreadable is a broken scraper and stops the import. The difference
   * matters: treating both as zero is exactly how a real total silently
   * becomes nothing.
   */
  private extractTotals(
    $: CheerioAPI,
    url: string | null,
    items: readonly RawInvoiceItem[],
  ): { grossTotal: Money; discountTotal: Money; netTotal: Money; taxTotal: Money } {
    const netTotalRaw = this.totalByLabel($, 'Valor a pagar R$');

    if (netTotalRaw === null) {
      throw new InvoiceStructureChangedError('The invoice does not report the amount paid.', url);
    }

    const netTotal = this.requireMoney(netTotalRaw, 'the amount paid', url);
    const grossTotalRaw = this.totalByLabel($, 'Valor total R$');
    const discountTotalRaw = this.totalByLabel($, 'Descontos R$');

    const discountTotal =
      discountTotalRaw === null
        ? Money.zero()
        : this.requireMoney(discountTotalRaw, 'the invoice discount', url);

    const grossTotal =
      grossTotalRaw === null
        ? netTotal.plus(discountTotal)
        : this.requireMoney(grossTotalRaw, 'the invoice gross total', url);

    if (!netTotal.equals(grossTotal.minus(discountTotal))) {
      throw new InvoiceStructureChangedError(
        `The invoice header does not close: ${grossTotal.toDecimalString()} gross minus ${discountTotal.toDecimalString()} of discount is not the ${netTotal.toDecimalString()} reported as paid.`,
        url,
      );
    }

    const linesTotal = items.reduce((total, item) => total.plus(item.grossValue), Money.zero());

    // A second integrity check, on the same principle as the item count: the
    // lines we read have to add up to the total the note itself states.
    if (!linesTotal.equals(grossTotal)) {
      throw new InvoiceStructureChangedError(
        `The extracted lines add up to ${linesTotal.toDecimalString()}, which does not match the invoice's own total of ${grossTotal.toDecimalString()}.`,
        url,
      );
    }

    const taxTotalRaw = collapse($('#totalNota span.txtObs').first().text());
    const taxTotal =
      taxTotalRaw.length === 0
        ? Money.zero()
        : this.requireMoney(taxTotalRaw, 'the tax total', url);

    return { grossTotal, discountTotal, netTotal, taxTotal };
  }

  private extractPayments($: CheerioAPI, url: string | null): RawInvoicePayment[] {
    const payments: RawInvoicePayment[] = [];

    $('#totalNota label.tx').each((_, element) => {
      const method = collapse($(element).text());
      const amount = $(element).closest('[id="linhaTotal"]').find('.totalNumb').first().text();

      if (method.length === 0) {
        return;
      }

      payments.push({
        method,
        amount: this.requireMoney(amount, `the amount paid by ${method}`, url),
      });
    });

    return payments;
  }

  /** The value of the `#totalNota` row whose label is exactly `label`, or null when there is no such row. */
  private totalByLabel($: CheerioAPI, label: string): string | null {
    for (const element of $('#totalNota [id="linhaTotal"]').toArray()) {
      const rowLabel = collapse($(element).find('label').first().text()).replace(/:$/, '');

      // Matched whole, not by prefix: "Qtd. total de itens" and "Valor total"
      // would otherwise answer to each other.
      if (rowLabel === label) {
        return $(element).find('.totalNumb').first().text();
      }
    }

    return null;
  }

  /**
   * A value that has to be there. This is the correction the previous
   * implementation needed most: it ran every amount through
   * `parseFloat(...) || 0`, so a selector that stopped matching produced a
   * confident zero instead of an error. A zero `grossValue` becomes a zero
   * `packageCost`, then a zero `unitCost`, and finally a suggested price
   * computed as though the ingredient were free — with nothing, anywhere,
   * reporting that something went wrong.
   */
  private requireMoney(raw: string, field: string, url: string | null): Money {
    const decimal = parseBrazilianDecimal(raw);

    if (decimal === null) {
      throw new InvoiceStructureChangedError(
        `The invoice does not carry a readable value for ${field}${raw.trim().length > 0 ? ` (found "${collapse(raw)}")` : ''}.`,
        url,
      );
    }

    return Money.fromDecimalString(decimal);
  }

  private requireQuantity(raw: string, field: string, url: string | null): number {
    const quantity = parseBrazilianQuantity(raw);

    if (quantity === null || quantity <= 0) {
      throw new InvoiceStructureChangedError(
        `The invoice does not carry a readable ${field}${raw.trim().length > 0 ? ` (found "${collapse(raw)}")` : ''}.`,
        url,
      );
    }

    return quantity;
  }
}

/** The portal indents its markup, so cell text arrives full of newlines and tabs. */
function collapse(text: string): string {
  return text.replace(/[\s\u00a0]+/g, ' ').trim();
}
