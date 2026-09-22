import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { EnvService } from '../../../../config/env.service';
import type { Env } from '../../../../config/env.schema';
import type { RepositoryContext } from '../../../../shared/domain/persistence/unit-of-work';
import { InMemoryUnitOfWork } from '../../../../shared/infrastructure/persistence/in-memory-unit-of-work';
import { RequestContextService } from '../../../../shared/infrastructure/logging/request-context.service';
import { StructuredLogger } from '../../../../shared/infrastructure/logging/structured-logger.service';
import { InMemoryCompositeProductRepository } from '../../../composite-products/infrastructure/persistence/in-memory-composite-product.repository';
import { InMemoryMaterialRepository } from '../../../materials/infrastructure/persistence/in-memory-material.repository';
import { InMemoryPurchaseRepository } from '../../../purchases/infrastructure/persistence/in-memory-purchase.repository';
import { InMemorySaleRepository } from '../../../sales/infrastructure/persistence/in-memory-sale.repository';
import { InMemoryUserRepository } from '../../../users/infrastructure/persistence/in-memory-user.repository';
import {
  DuplicateInvoiceError,
  HttpTransportError,
  InvoiceSourceUnavailableError,
  InvoiceStructureChangedError,
  UnsupportedFederalUnitError,
} from '../../domain/invoice.error';
import type { Delay } from '../../domain/ports/delay.port';
import type { HttpClient, HttpResponse } from '../../domain/ports/http-client.port';
import type {
  InvoiceProvider,
  InvoiceProviderFactory,
} from '../../domain/providers/invoice-provider';
import { InMemoryPendingInvoiceRepository } from '../../infrastructure/persistence/in-memory-pending-invoice.repository';
import { ScrapingRsProvider } from '../../infrastructure/providers/scraping-rs.provider';
import { InvoiceImportFacade } from './invoice-import.facade';

const FIXTURES = join(__dirname, '..', '..', '..', '..', '..', 'test', 'fixtures', 'nfce');
const URL =
  'https://www.sefaz.rs.gov.br/NFCE/NFC-E-COM.aspx?p=43000000000000000000000000000000000000000000|2|1';

function fixture(name: string): string {
  return readFileSync(join(FIXTURES, `${name}.html`), 'utf8');
}

function silentLogger(): StructuredLogger {
  const logger = new StructuredLogger(
    { get: () => 'error' } as unknown as EnvService,
    new RequestContextService(),
  );
  jest.spyOn(logger, 'warn').mockImplementation(() => undefined);
  jest.spyOn(logger, 'error').mockImplementation(() => undefined);

  return logger;
}

/** Records what it was asked to wait, and never actually waits. */
class RecordingDelay implements Delay {
  readonly waits: number[] = [];

  async wait(milliseconds: number): Promise<void> {
    this.waits.push(milliseconds);
    return Promise.resolve();
  }
}

/** Answers a scripted sequence, so a retry can be observed without a network. */
class ScriptedHttpClient implements HttpClient {
  calls = 0;

  constructor(private readonly script: (Partial<HttpResponse> & { throws?: Error })[]) {}

  async get(): Promise<HttpResponse> {
    const step = this.script[Math.min(this.calls, this.script.length - 1)];
    this.calls += 1;

    if (step.throws) {
      throw step.throws;
    }

    return Promise.resolve({ status: step.status ?? 200, body: step.body ?? '' });
  }
}

function buildFacade(
  http: HttpClient,
  options: { maxAttempts?: number; factory?: InvoiceProviderFactory } = {},
): {
  facade: InvoiceImportFacade;
  purchases: InMemoryPurchaseRepository;
  pendingInvoices: InMemoryPendingInvoiceRepository;
  delay: RecordingDelay;
} {
  const purchases = new InMemoryPurchaseRepository();
  const pendingInvoices = new InMemoryPendingInvoiceRepository();
  const context: RepositoryContext = {
    materials: new InMemoryMaterialRepository(),
    compositeProducts: new InMemoryCompositeProductRepository(),
    sales: new InMemorySaleRepository(),
    purchases,
    pendingInvoices,
    users: new InMemoryUserRepository(),
  };

  const env = {
    get: <K extends keyof Env>(key: K): Env[K] =>
      ({
        NFCE_IMPORT_MAX_ATTEMPTS: options.maxAttempts ?? 3,
        NFCE_IMPORT_RETRY_DELAY_MS: 1_000,
        NFCE_PROVIDER: 'AUTO',
      })[key as string] as Env[K],
  } as EnvService;

  const provider: InvoiceProvider = new ScrapingRsProvider(http, silentLogger());
  const factory: InvoiceProviderFactory = options.factory ?? { create: () => provider };
  const delay = new RecordingDelay();

  return {
    facade: new InvoiceImportFacade(
      new InMemoryUnitOfWork(context),
      factory,
      delay,
      env,
      silentLogger(),
    ),
    purchases,
    pendingInvoices,
    delay,
  };
}

describe('InvoiceImportFacade, importing a note', () => {
  it('turns a captured URL into a Purchase', async () => {
    const { facade, purchases } = buildFacade(
      new ScriptedHttpClient([{ body: fixture('rs-nota-completa') }]),
    );

    const view = await facade.importFromUrl(URL);

    expect(view.accessKey).toHaveLength(44);
    expect(view.grossTotal).toBe('336.35');
    expect(view.discountTotal).toBe('6.40');
    expect(await purchases.findByAccessKey(view.accessKey as string)).not.toBeNull();
  });

  /**
   * Twelve printed lines, four of them weighings of the same cheese and two
   * of the same gouda, become eight lines to classify. Without this the user
   * would classify the cheese four times and create four stock entries.
   */
  it('aggregates the weighed lines by product code', async () => {
    const { facade } = buildFacade(new ScriptedHttpClient([{ body: fixture('rs-nota-completa') }]));

    const view = await facade.importFromUrl(URL);

    expect(view.items).toHaveLength(8);
    expect(view.items.filter((item) => item.code === '92342')).toHaveLength(1);
  });

  /**
   * The printed lines are a captured fact and survive in full, so the
   * aggregation can always be re-derived from them while the reverse cannot.
   */
  it('keeps every printed line in rawInvoiceData', async () => {
    const { facade, purchases } = buildFacade(
      new ScriptedHttpClient([{ body: fixture('rs-nota-completa') }]),
    );

    const view = await facade.importFromUrl(URL);
    const purchase = await purchases.findById(view.purchaseId);
    const raw = purchase?.rawInvoiceData as { items: unknown[] };

    expect(raw.items).toHaveLength(12);
    expect(purchase?.items).toHaveLength(8);
  });

  /** The page carries a CPF; nothing upstream reads it, so none reaches here. */
  it('never stores the consumer CPF in rawInvoiceData', async () => {
    const { facade, purchases } = buildFacade(
      new ScriptedHttpClient([{ body: fixture('rs-nota-completa') }]),
    );

    const view = await facade.importFromUrl(URL);
    const purchase = await purchases.findById(view.purchaseId);

    expect(JSON.stringify(purchase?.rawInvoiceData)).not.toContain('000.000.000-00');
    expect(JSON.stringify(purchase?.rawInvoiceData).toLowerCase()).not.toContain('cpf');
  });

  it('closes the capture as IMPORTED against the purchase it produced', async () => {
    const { facade, pendingInvoices } = buildFacade(
      new ScriptedHttpClient([{ body: fixture('rs-nota-completa') }]),
    );

    const view = await facade.importFromUrl(URL);
    const [pending] = await pendingInvoices.findByStatus('IMPORTED');

    expect(pending.purchaseId).toBe(view.purchaseId);
    expect(pending.url).toBe(URL);
  });

  it('queues the capture before it tries to read the portal', async () => {
    const { facade, pendingInvoices } = buildFacade(
      new ScriptedHttpClient([{ throws: new HttpTransportError('down') }]),
    );

    await expect(facade.importFromUrl(URL)).rejects.toThrow(InvoiceSourceUnavailableError);

    // The capture survived the failure, which is what lets it be retried from
    // another device later.
    expect(await pendingInvoices.findAll()).toHaveLength(1);
  });

  /**
   * A note with no discount does not raise the question at all.
   */
  it('does not ask for a discount mode on a note without a discount', async () => {
    const { facade } = buildFacade(
      new ScriptedHttpClient([{ body: fixture('rs-nota-item-unico') }]),
    );

    const view = await facade.importFromUrl(URL.replace('43', '43'));

    expect(view.discountTotal).toBe('0.00');
    expect(view.requiresDiscountAllocationChoice).toBe(false);
    expect(view.items.every((item) => item.allocatedDiscount === '0.00')).toBe(true);
  });

  it('asks for a discount mode on a note that carries one', async () => {
    const { facade } = buildFacade(
      new ScriptedHttpClient([{ body: fixture('rs-nota-com-desconto') }]),
    );

    const view = await facade.importFromUrl(URL);

    expect(view.requiresDiscountAllocationChoice).toBe(true);
    expect(view.discountAllocationMode).toBe('PROPORTIONAL');
  });

  it('attributes the discount so the lines close with the note total', async () => {
    const { facade } = buildFacade(
      new ScriptedHttpClient([{ body: fixture('rs-nota-com-desconto') }]),
    );

    const view = await facade.importFromUrl(URL);
    const attributed = view.items.reduce(
      (total, item) => total + Number(item.allocatedDiscount),
      0,
    );

    expect(attributed).toBeCloseTo(0.8, 10);
  });
});

describe('InvoiceImportFacade, deduplication by access key', () => {
  /**
   * Scanning the same receipt twice must not record the purchase twice. The
   * caller is told where the existing one is, rather than merely refused.
   */
  it('refuses a second import of the same note and names the existing purchase', async () => {
    const { facade, purchases } = buildFacade(
      new ScriptedHttpClient([{ body: fixture('rs-nota-completa') }]),
    );

    const first = await facade.importFromUrl(URL);

    await expect(facade.importFromUrl(URL)).rejects.toThrow(DuplicateInvoiceError);
    await expect(facade.importFromUrl(URL)).rejects.toMatchObject({
      existingPurchaseId: first.purchaseId,
    });
    expect(await purchases.findAll()).toHaveLength(1);
  });

  it('deduplicates across different capture URLs carrying the same key', async () => {
    const { facade, purchases } = buildFacade(
      new ScriptedHttpClient([{ body: fixture('rs-nota-completa') }]),
    );

    await facade.importFromUrl(URL);

    await expect(facade.importFromUrl(`${URL}&via=outro-aparelho`)).rejects.toThrow(
      DuplicateInvoiceError,
    );
    expect(await purchases.findAll()).toHaveLength(1);
  });
});

describe('InvoiceImportFacade, when the portal is unavailable', () => {
  it('retries with a progressive wait and gives up after the configured attempts', async () => {
    const http = new ScriptedHttpClient([{ throws: new HttpTransportError('socket hang up') }]);
    const { facade, delay } = buildFacade(http);

    await expect(facade.importFromUrl(URL)).rejects.toThrow(InvoiceSourceUnavailableError);

    expect(http.calls).toBe(3);
    expect(delay.waits).toEqual([1_000, 2_000]);
  });

  it('parks the capture as UNSTABLE with its attempt counted', async () => {
    const { facade, pendingInvoices } = buildFacade(new ScriptedHttpClient([{ status: 503 }]));

    await expect(facade.importFromUrl(URL)).rejects.toThrow(InvoiceSourceUnavailableError);

    const [pending] = await pendingInvoices.findByStatus('UNSTABLE');
    expect(pending.status).toBe('UNSTABLE');
    expect(pending.attemptCount).toBe(1);
    expect(pending.lastError).toContain('did not answer after 3 attempts');
  });

  it('succeeds on a later attempt when the portal comes back', async () => {
    const http = new ScriptedHttpClient([
      { throws: new HttpTransportError('down') },
      { body: fixture('rs-nota-completa') },
    ]);
    const { facade } = buildFacade(http);

    const view = await facade.importFromUrl(URL);

    expect(view.grossTotal).toBe('336.35');
    expect(http.calls).toBe(2);
  });

  /** The queue is what makes the capture resumable from another device. */
  it('imports a parked capture when it is reprocessed', async () => {
    const http = new ScriptedHttpClient([{ status: 503 }]);
    const { facade, pendingInvoices } = buildFacade(http);

    await expect(facade.importFromUrl(URL)).rejects.toThrow(InvoiceSourceUnavailableError);
    const [parked] = await pendingInvoices.findByStatus('UNSTABLE');

    http.calls = 0;
    (http as unknown as { script: unknown[] }).script = [{ body: fixture('rs-nota-completa') }];

    const view = await facade.reprocess(parked.id);

    expect(view.grossTotal).toBe('336.35');
    expect((await pendingInvoices.findById(parked.id))?.status).toBe('IMPORTED');
  });

  it('refuses to reprocess a capture that was already imported', async () => {
    const { facade, pendingInvoices } = buildFacade(
      new ScriptedHttpClient([{ body: fixture('rs-nota-completa') }]),
    );

    await facade.importFromUrl(URL);
    const [imported] = await pendingInvoices.findByStatus('IMPORTED');

    await expect(facade.reprocess(imported.id)).rejects.toThrow(DuplicateInvoiceError);
  });
});

describe('InvoiceImportFacade, when the page is not a note', () => {
  /**
   * The portal is up and our parsing is what broke, so there is nothing to
   * retry: the page will not become a note a second later.
   */
  it('does not retry a structurally broken page', async () => {
    const http = new ScriptedHttpClient([{ body: fixture('rs-nota-inexistente') }]);
    const { facade, delay } = buildFacade(http);

    await expect(facade.importFromUrl(URL)).rejects.toThrow(InvoiceStructureChangedError);

    expect(http.calls).toBe(1);
    expect(delay.waits).toEqual([]);
  });

  it('keeps the capture PENDING rather than UNSTABLE, and records why', async () => {
    const { facade, pendingInvoices } = buildFacade(
      new ScriptedHttpClient([{ body: fixture('rs-nota-inexistente') }]),
    );

    await expect(facade.importFromUrl(URL)).rejects.toThrow(InvoiceStructureChangedError);

    const [pending] = await pendingInvoices.findByStatus('PENDING');
    expect(pending.attemptCount).toBe(1);
    expect(pending.lastError).toContain('not an invoice');
  });

  /**
   * A 404 reaches the same non-retryable path: the portal answered, so there
   * is nothing to wait for.
   */
  it('does not retry a 404 from the portal', async () => {
    const http = new ScriptedHttpClient([{ status: 404 }]);
    const { facade, delay } = buildFacade(http);

    await expect(facade.importFromUrl(URL)).rejects.toThrow(InvoiceStructureChangedError);

    expect(http.calls).toBe(1);
    expect(delay.waits).toEqual([]);
  });

  it('records no purchase at all', async () => {
    const { facade, purchases } = buildFacade(
      new ScriptedHttpClient([{ body: fixture('rs-nota-inexistente') }]),
    );

    await expect(facade.importFromUrl(URL)).rejects.toThrow(InvoiceStructureChangedError);
    expect(await purchases.findAll()).toHaveLength(0);
  });
});

describe('InvoiceImportFacade, when no provider covers the state', () => {
  it('fails explicitly rather than scraping the wrong portal', async () => {
    const { facade } = buildFacade(new ScriptedHttpClient([{}]), {
      factory: {
        create: () => {
          throw new UnsupportedFederalUnitError('NFC-e import is not available for MG.');
        },
      },
    });

    await expect(facade.importFromUrl(URL)).rejects.toThrow(UnsupportedFederalUnitError);
  });
});
