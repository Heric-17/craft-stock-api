import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { EnvService } from '../../../../config/env.service';
import { Money } from '../../../../shared/domain/money/money';
import type {
  NotificationSender,
  NotificationSenderFactory,
} from '../../../../shared/domain/notifications/notification-sender';
import { RequestContextService } from '../../../../shared/infrastructure/logging/request-context.service';
import { StructuredLogger } from '../../../../shared/infrastructure/logging/structured-logger.service';
import type { ReferenceInvoiceExpectation } from '../../domain/canary/reference-invoice';
import { HttpTransportError } from '../../domain/invoice.error';
import type { HttpClient, HttpResponse } from '../../domain/ports/http-client.port';
import type {
  InvoiceProvider,
  InvoiceProviderFactory,
} from '../../domain/providers/invoice-provider';
import { ScrapingRsProvider } from '../../infrastructure/providers/scraping-rs.provider';
import { NfceCanaryService } from './nfce-canary.service';

const FIXTURES = join(__dirname, '..', '..', '..', '..', '..', 'test', 'fixtures', 'nfce');

/**
 * Read straight off disk, and altered in memory only. Nothing here — and
 * nothing in production — writes to `test/fixtures/`: a fixture refreshed from
 * the live portal would make the scraper's tests validate the new markup and
 * stay green, which is exactly the alarm the canary exists to raise.
 */
function fixture(name: string): string {
  return readFileSync(join(FIXTURES, `${name}.html`), 'utf8');
}

const COMPLETE_KEY = '43000000000000000000000000000000000000000000';
const DISCOUNTED_KEY = '43000000000000000000000000000000000000000002';
const SINGLE_ITEM_KEY = '43000000000000000000000000000000000000000003';

/** What each fixture note reads as today, pinned the way an installation would. */
const COMPLETE_NOTE: ReferenceInvoiceExpectation = {
  accessKey: COMPLETE_KEY,
  label: 'Atacadão, June 2026',
  merchantName: 'ATACADAO S.A.',
  grossTotal: Money.fromDecimalString('336.35'),
  itemCount: 12,
};

const DISCOUNTED_NOTE: ReferenceInvoiceExpectation = {
  accessKey: DISCOUNTED_KEY,
  label: 'Atacadão, March 2026',
  merchantName: 'ATACADAO S.A.',
  grossTotal: Money.fromDecimalString('20.45'),
  itemCount: 2,
};

const SINGLE_ITEM_NOTE: ReferenceInvoiceExpectation = {
  accessKey: SINGLE_ITEM_KEY,
  label: 'Picolino, December 2025',
  merchantName: 'PICOLINO KIDS COMERCIO DE VESTUARIO EIRELI',
  grossTotal: Money.fromDecimalString('46.99'),
  itemCount: 1,
};

function urlFor(accessKey: string): string {
  return `https://www.sefaz.rs.gov.br/NFCE/NFC-E-COM.aspx?p=${accessKey}|2|1|1|abc`;
}

/** What the portal answers for one URL. `throws` is the network refusing outright. */
interface Page {
  body?: string;
  status?: number;
  throws?: Error;
}

function clientReturning(page: Page): HttpClient {
  return {
    get: (): Promise<HttpResponse> => {
      if (page.throws) {
        return Promise.reject(page.throws);
      }

      return Promise.resolve({ status: page.status ?? 200, body: page.body ?? '' });
    },
  };
}

function silentLogger(): StructuredLogger {
  const env = { get: () => 'error' } as unknown as EnvService;
  const logger = new StructuredLogger(env, new RequestContextService());

  jest.spyOn(logger, 'log').mockImplementation(() => undefined);
  jest.spyOn(logger, 'warn').mockImplementation(() => undefined);
  jest.spyOn(logger, 'error').mockImplementation(() => undefined);

  return logger;
}

/**
 * The real RS scraper behind a fake HTTP client, which is what makes these
 * tests worth running: the whole extraction path runs, against fixture markup,
 * and never touches the network.
 */
function factoryServing(
  pages: Map<string, Page>,
  logger: StructuredLogger,
): InvoiceProviderFactory {
  return {
    create: (url: string): InvoiceProvider => {
      const page = pages.get(url) ?? {
        throws: new Error(`This test registered no page for ${url}.`),
      };

      return new ScrapingRsProvider(clientReturning(page), logger);
    },
  };
}

interface SentAlert {
  subject: string;
  body: string;
}

function senderRecording(sent: SentAlert[], failure?: Error): NotificationSenderFactory {
  const sender: NotificationSender = {
    send: (subject, body) => {
      if (failure) {
        return Promise.reject(failure);
      }

      sent.push({ subject, body });

      return Promise.resolve();
    },
  };

  return { create: () => sender };
}

function envWith(urls: readonly string[]): EnvService {
  return {
    get: (key: string) => (key === 'NFCE_CANARY_URLS' ? urls.join(',') : undefined),
  } as unknown as EnvService;
}

function buildService(options: {
  references: readonly ReferenceInvoiceExpectation[];
  pages: Map<string, Page>;
  urls?: readonly string[];
  sendFailure?: Error;
}): { service: NfceCanaryService; sent: SentAlert[]; logger: StructuredLogger } {
  const sent: SentAlert[] = [];
  const logger = silentLogger();
  const urls = options.urls ?? options.references.map((reference) => urlFor(reference.accessKey));

  const service = new NfceCanaryService(
    factoryServing(options.pages, logger),
    senderRecording(sent, options.sendFailure),
    options.references,
    envWith(urls),
    logger,
  );

  return { service, sent, logger };
}

function serving(entries: [ReferenceInvoiceExpectation, Page][]): Map<string, Page> {
  return new Map(entries.map(([note, page]) => [urlFor(note.accessKey), page]));
}

function replaceOnce(html: string, from: string | RegExp, to: string): string {
  const altered = html.replace(from, to);

  if (altered === html) {
    throw new Error(`The fixture no longer carries ${String(from)}, so this test proves nothing.`);
  }

  return altered;
}

function withMerchantName(html: string, merchantName: string): string {
  return replaceOnce(html, '>ATACADAO S.A.<', `>${merchantName}<`);
}

/**
 * The scraper checks the header against itself and against the sum of the
 * lines, so a total that changes plausibly has to move all three together —
 * which is what the portal reporting a different amount would actually look
 * like. A total changed on its own is refused as broken markup instead, which
 * is a different test.
 */
function withGrossTotalOneRealHigher(html: string): string {
  return (
    [
      ['"totalNumb">336,35<', '"totalNumb">337,35<'],
      ['txtMax">329,95<', 'txtMax">330,95<'],
      ['class="valor">37,96<', 'class="valor">38,96<'],
    ] as const
  ).reduce((current, [from, to]) => replaceOnce(current, from, to), html);
}

/**
 * One line fewer, with its value moved onto another line and the note's own
 * count corrected. Everything still adds up, so the only thing the canary can
 * notice is that the table yielded eleven lines where twelve were pinned.
 */
function withOneItemFewer(html: string): string {
  return (
    [
      [/<tr id="Item \+ 1">[\s\S]*?<\/tr>/, ''],
      ['class="valor">51,96<', 'class="valor">89,92<'],
      [
        'Qtd. total de itens:</label><span class="totalNumb">12</span>',
        'Qtd. total de itens:</label><span class="totalNumb">11</span>',
      ],
    ] as [string | RegExp, string][]
  ).reduce((current, [from, to]) => replaceOnce(current, from, to), html);
}

const PORTAL_REFUSED = new HttpTransportError('socket hang up');

describe('NfceCanaryService, with nothing to check', () => {
  it('checks nothing and alerts nobody when no reference note is pinned', async () => {
    const { service, sent } = buildService({ references: [], pages: new Map(), urls: [] });

    await expect(service.run()).resolves.toEqual({ checks: [], alerted: false });
    expect(sent).toEqual([]);
  });

  it('reports a configured URL that no pinned note matches instead of checking it', async () => {
    const { service, sent, logger } = buildService({
      references: [COMPLETE_NOTE],
      pages: new Map(),
      urls: [urlFor(SINGLE_ITEM_KEY)],
    });

    const run = await service.run();

    expect(run).toEqual({ checks: [], alerted: false });
    expect(sent).toEqual([]);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('carries no access key matching a pinned reference note'),
      'NfceCanaryService',
    );
  });
});

describe('NfceCanaryService, against the unaltered fixtures', () => {
  it('finds every reference note reading exactly as pinned', async () => {
    const { service, sent } = buildService({
      references: [COMPLETE_NOTE, DISCOUNTED_NOTE, SINGLE_ITEM_NOTE],
      pages: serving([
        [COMPLETE_NOTE, { body: fixture('rs-nota-completa') }],
        [DISCOUNTED_NOTE, { body: fixture('rs-nota-com-desconto') }],
        [SINGLE_ITEM_NOTE, { body: fixture('rs-nota-item-unico') }],
      ]),
    });

    const run = await service.run();

    expect(run.checks.map((check) => check.status)).toEqual(['MATCHED', 'MATCHED', 'MATCHED']);
    expect(run.alerted).toBe(false);
    expect(sent).toEqual([]);
  });
});

/**
 * One reference note per test, so the divergence is the only reason the run
 * fails and the alert has to carry that field.
 */
describe('NfceCanaryService, against an altered fixture', () => {
  async function runAgainst(
    body: string,
  ): Promise<{ run: Awaited<ReturnType<NfceCanaryService['run']>>; sent: SentAlert[] }> {
    const { service, sent } = buildService({
      references: [COMPLETE_NOTE],
      pages: serving([[COMPLETE_NOTE, { body }]]),
    });

    return { run: await service.run(), sent };
  }

  it('detects the establishment name having changed', async () => {
    const { run, sent } = await runAgainst(
      withMerchantName(fixture('rs-nota-completa'), 'ATACADAO S/A - FILIAL 88'),
    );

    expect(run.checks[0].status).toBe('DIVERGED');
    expect(run.checks[0].mismatches).toEqual([
      { field: 'merchantName', expected: 'ATACADAO S.A.', actual: 'ATACADAO S/A - FILIAL 88' },
    ]);
    expect(run.alerted).toBe(true);
    expect(sent[0].body).toContain(
      'merchantName expected "ATACADAO S.A.", got "ATACADAO S/A - FILIAL 88"',
    );
  });

  it('detects the invoice total having changed', async () => {
    const { run, sent } = await runAgainst(
      withGrossTotalOneRealHigher(fixture('rs-nota-completa')),
    );

    expect(run.checks[0].status).toBe('DIVERGED');
    expect(run.checks[0].mismatches).toEqual([
      { field: 'grossTotal', expected: '336.35', actual: '337.35' },
    ]);
    expect(run.alerted).toBe(true);
    expect(sent[0].body).toContain('grossTotal expected "336.35", got "337.35"');
  });

  it('detects the item count having changed', async () => {
    const { run, sent } = await runAgainst(withOneItemFewer(fixture('rs-nota-completa')));

    expect(run.checks[0].status).toBe('DIVERGED');
    expect(run.checks[0].mismatches).toEqual([
      { field: 'itemCount', expected: '12', actual: '11' },
    ]);
    expect(run.alerted).toBe(true);
    expect(sent[0].body).toContain('itemCount expected "12", got "11"');
  });
});

describe('NfceCanaryService, telling an expired note from a broken portal', () => {
  const pinned = [COMPLETE_NOTE, DISCOUNTED_NOTE, SINGLE_ITEM_NOTE];

  it('does not alert when only one reference note fails', async () => {
    // The consultation of an NFC-e does not stay up forever. With the other two
    // still reading correctly, the portal is plainly fine and the parser with
    // it: this note is old, not broken.
    const { service, sent, logger } = buildService({
      references: pinned,
      pages: serving([
        [COMPLETE_NOTE, { throws: PORTAL_REFUSED }],
        [DISCOUNTED_NOTE, { body: fixture('rs-nota-com-desconto') }],
        [SINGLE_ITEM_NOTE, { body: fixture('rs-nota-item-unico') }],
      ]),
    });

    const run = await service.run();

    expect(run.checks.map((check) => check.status)).toEqual(['UNREACHABLE', 'MATCHED', 'MATCHED']);
    expect(run.alerted).toBe(false);
    expect(sent).toEqual([]);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('1 of 3 reference notes failed'),
      'NfceCanaryService',
    );
  });

  it('does not alert when a single note diverges while the others still match', async () => {
    const { service, sent } = buildService({
      references: pinned,
      pages: serving([
        [
          COMPLETE_NOTE,
          { body: withMerchantName(fixture('rs-nota-completa'), 'OUTRO MERCADO LTDA') },
        ],
        [DISCOUNTED_NOTE, { body: fixture('rs-nota-com-desconto') }],
        [SINGLE_ITEM_NOTE, { body: fixture('rs-nota-item-unico') }],
      ]),
    });

    const run = await service.run();

    expect(run.checks[0].status).toBe('DIVERGED');
    expect(run.alerted).toBe(false);
    expect(sent).toEqual([]);
  });

  it('alerts when every reference note fails to answer', async () => {
    const { service, sent } = buildService({
      references: pinned,
      pages: serving([
        [COMPLETE_NOTE, { throws: PORTAL_REFUSED }],
        [DISCOUNTED_NOTE, { throws: PORTAL_REFUSED }],
        [SINGLE_ITEM_NOTE, { throws: PORTAL_REFUSED }],
      ]),
    });

    const run = await service.run();

    expect(run.checks.map((check) => check.status)).toEqual([
      'UNREACHABLE',
      'UNREACHABLE',
      'UNREACHABLE',
    ]);
    expect(run.alerted).toBe(true);
    expect(sent).toHaveLength(1);
    expect(sent[0].subject).toContain('No NFC-e reference note could be read');
    for (const note of pinned) {
      expect(sent[0].body).toContain(note.label);
    }
  });

  it('alerts when the parser refuses every page it is served', async () => {
    // The page came back, and is not a note: the markers the scraper is written
    // against are gone from all three. That is the portal having changed.
    const brokenPage = { body: fixture('rs-nota-inexistente') };
    const { service, sent } = buildService({
      references: pinned,
      pages: serving([
        [COMPLETE_NOTE, brokenPage],
        [DISCOUNTED_NOTE, brokenPage],
        [SINGLE_ITEM_NOTE, brokenPage],
      ]),
    });

    const run = await service.run();

    expect(run.checks.map((check) => check.status)).toEqual([
      'STRUCTURE_CHANGED',
      'STRUCTURE_CHANGED',
      'STRUCTURE_CHANGED',
    ]);
    expect(run.alerted).toBe(true);
    expect(sent[0].subject).toContain('no longer matches the reference notes');
    expect(sent[0].body).toContain('is not an invoice');
  });
});

describe('NfceCanaryService, when the alert cannot be delivered', () => {
  it('finishes the run and logs the delivery failure', async () => {
    const { service, sent, logger } = buildService({
      references: [COMPLETE_NOTE, DISCOUNTED_NOTE],
      pages: serving([
        [COMPLETE_NOTE, { throws: PORTAL_REFUSED }],
        [DISCOUNTED_NOTE, { throws: PORTAL_REFUSED }],
      ]),
      sendFailure: new Error('SMTP connection refused'),
    });

    const run = await service.run();

    expect(run.alerted).toBe(true);
    expect(run.checks).toHaveLength(2);
    expect(sent).toEqual([]);
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('could not send its alert'),
      expect.anything(),
      'NfceCanaryService',
    );
  });

  it('never lets the scheduled run reject', async () => {
    const { service } = buildService({
      references: [COMPLETE_NOTE],
      pages: serving([[COMPLETE_NOTE, { throws: PORTAL_REFUSED }]]),
      sendFailure: new Error('SMTP connection refused'),
    });

    await expect(service.handleCron()).resolves.toBeUndefined();
  });
});
