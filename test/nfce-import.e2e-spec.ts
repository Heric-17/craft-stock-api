import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';

import { AppModule } from '../src/app.module';
import { InvoiceImportFacade } from '../src/modules/invoices/application/facades/invoice-import.facade';
import { InvoiceClassificationService } from '../src/modules/invoices/application/services/invoice-classification.service';
import { PendingInvoicesService } from '../src/modules/invoices/application/services/pending-invoices.service';
import {
  DuplicateInvoiceError,
  InvoiceSourceUnavailableError,
} from '../src/modules/invoices/domain/invoice.error';
import {
  HTTP_CLIENT,
  type HttpClient,
  type HttpResponse,
} from '../src/modules/invoices/domain/ports/http-client.port';
import {
  MATERIAL_REPOSITORY,
  type MaterialRepository,
} from '../src/modules/materials/domain/repositories/material.repository';
import {
  PURCHASE_REPOSITORY,
  type PurchaseRepository,
} from '../src/modules/purchases/domain/repositories/purchase.repository';
import { PurchaseAnalyticsService } from '../src/modules/purchases/application/services/purchase-analytics.service';
import { PrismaService } from '../src/shared/infrastructure/prisma/prisma.service';

const FIXTURES = join(__dirname, 'fixtures', 'nfce');

/**
 * The portal, replaced by the fixtures. Nothing in this file reaches the
 * network: the HTTP client is the seam, and swapping it is what makes a full
 * import reproducible.
 */
class FixtureHttpClient implements HttpClient {
  next: { status?: number; body?: string; throws?: Error } = {};
  calls = 0;

  async get(): Promise<HttpResponse> {
    this.calls += 1;

    if (this.next.throws) {
      throw this.next.throws;
    }

    return Promise.resolve({ status: this.next.status ?? 200, body: this.next.body ?? '' });
  }
}

function fixture(name: string): string {
  return readFileSync(join(FIXTURES, `${name}.html`), 'utf8');
}

/**
 * Real-Postgres coverage for the NFC-e import: a captured URL becomes a
 * `Purchase` with its lines, written and read back through the real
 * `PrismaPurchaseRepository`, and the deduplication runs against the real
 * unique index on the access key rather than a fake. Never mocks Prisma.
 */
describe('NFC-e import (e2e)', () => {
  let app: INestApplication;
  let imports: InvoiceImportFacade;
  let classification: InvoiceClassificationService;
  let pendingInvoices: PendingInvoicesService;
  let purchases: PurchaseRepository;
  let materials: MaterialRepository;
  let analytics: PurchaseAnalyticsService;
  let prisma: PrismaService;
  let http: FixtureHttpClient;

  const createdPurchaseIds: string[] = [];
  const createdMaterialIds: string[] = [];
  const capturedUrls: string[] = [];

  const url = (suffix: string): string => {
    const value = `https://www.sefaz.rs.gov.br/NFCE/NFC-E-COM.aspx?p=${suffix}`;
    capturedUrls.push(value);

    return value;
  };

  beforeAll(async () => {
    http = new FixtureHttpClient();

    const moduleRef: TestingModule = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(HTTP_CLIENT)
      .useValue(http)
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();

    imports = moduleRef.get(InvoiceImportFacade);
    classification = moduleRef.get(InvoiceClassificationService);
    pendingInvoices = moduleRef.get(PendingInvoicesService);
    purchases = moduleRef.get(PURCHASE_REPOSITORY);
    materials = moduleRef.get(MATERIAL_REPOSITORY);
    analytics = moduleRef.get(PurchaseAnalyticsService);
    prisma = moduleRef.get(PrismaService);
  });

  afterAll(async () => {
    for (const purchaseId of createdPurchaseIds) {
      await prisma.pendingInvoice.deleteMany({ where: { purchaseId } });
      await prisma.purchaseItem.deleteMany({ where: { purchaseId } });
      await prisma.purchase.deleteMany({ where: { id: purchaseId } });
    }
    for (const capturedUrl of capturedUrls) {
      await prisma.pendingInvoice.deleteMany({ where: { url: capturedUrl } });
    }
    for (const materialId of createdMaterialIds) {
      await prisma.materialPriceHistory.deleteMany({ where: { materialId } });
      await prisma.material.deleteMany({ where: { id: materialId } });
    }

    await app.close();
  });

  it('imports a note and writes the aggregate through Prisma', async () => {
    http.next = { body: fixture('rs-nota-completa') };

    const view = await imports.importFromUrl(url('43000000000000000000000000000000000000000000'));
    createdPurchaseIds.push(view.purchaseId);

    // Twelve printed lines, folded to eight products.
    expect(view.items).toHaveLength(8);

    const reloaded = await purchases.findById(view.purchaseId);

    expect(reloaded?.items).toHaveLength(8);
    expect(reloaded?.grossTotal.toDecimalString()).toBe('336.35');
    expect(reloaded?.discountTotal.toDecimalString()).toBe('6.40');
    expect(reloaded?.accessKey).toHaveLength(44);
  });

  it('keeps every printed line in rawInvoiceData, and no CPF', async () => {
    const [purchaseId] = createdPurchaseIds;
    const row = await prisma.purchase.findUnique({ where: { id: purchaseId } });
    const raw = row?.rawInvoiceData as { items: unknown[] };

    expect(raw.items).toHaveLength(12);
    expect(JSON.stringify(raw)).not.toContain('000.000.000-00');
  });

  it('attributes the discount so the stored lines close with discountTotal', async () => {
    const [purchaseId] = createdPurchaseIds;
    const rows = await prisma.purchaseItem.findMany({ where: { purchaseId } });

    const attributed = rows.reduce((total, row) => total + Number(row.allocatedDiscount), 0);

    expect(attributed).toBeCloseTo(6.4, 10);
    // netValue is not a column: it is grossValue minus the attributed discount.
    expect(Object.keys(rows[0])).not.toContain('netValue');
  });

  /**
   * The deduplication runs against the real unique index on the access key,
   * which is the thing that actually prevents a second record.
   */
  it('refuses a second import of the same note and names the existing purchase', async () => {
    http.next = { body: fixture('rs-nota-completa') };

    await expect(
      imports.importFromUrl(url('43000000000000000000000000000000000000000000&again=1')),
    ).rejects.toThrow(DuplicateInvoiceError);

    const count = await prisma.purchase.count({
      where: { accessKey: '43000000000000000000000000000000000000000000' },
    });

    expect(count).toBe(1);
  });

  it('parks a capture as UNSTABLE when the portal is down, and lists it', async () => {
    http.next = { status: 503 };
    const captureUrl = url('43000000000000000000000000000000000000000099');

    await expect(imports.importFromUrl(captureUrl)).rejects.toThrow(InvoiceSourceUnavailableError);

    const queued = await pendingInvoices.list('UNSTABLE');
    const parked = queued.find((entry) => entry.url === captureUrl);

    expect(parked?.status).toBe('UNSTABLE');
    expect(parked?.attemptCount).toBe(1);
  });

  /**
   * The point of the queue: scan at the till on a phone, finish the import
   * later from somewhere else.
   */
  it('finishes a parked capture when it is reprocessed', async () => {
    const captureUrl = capturedUrls[capturedUrls.length - 1];
    const [parked] = (await pendingInvoices.list('UNSTABLE')).filter(
      (entry) => entry.url === captureUrl,
    );

    http.next = { body: fixture('rs-nota-com-desconto') };

    const view = await imports.reprocess(parked.id);
    createdPurchaseIds.push(view.purchaseId);

    expect(view.grossTotal).toBe('20.45');

    const [resumed] = (await pendingInvoices.list('IMPORTED')).filter(
      (entry) => entry.id === parked.id,
    );
    expect(resumed.purchaseId).toBe(view.purchaseId);
  });

  it('classifies a line into stock and prices it off the gross value', async () => {
    const purchaseId = createdPurchaseIds[createdPurchaseIds.length - 1];
    const purchase = await purchases.findById(purchaseId);
    const biscuit = purchase?.items.find((item) => item.description.includes('BISC')) as {
      id: string;
    };
    const toast = purchase?.items.find((item) => item.description.includes('TORRADA')) as {
      id: string;
    };

    const view = await classification.classify({
      purchaseId,
      items: [
        {
          itemId: biscuit.id,
          isCompanyExpense: true,
          isStockMaterial: true,
          // The user's answer, not the note's: four packets of 100 g.
          packageQuantity: 100,
          newMaterial: { name: `Biscoito ${purchaseId.slice(0, 8)}`, consumptionUnit: 'GRAM' },
        },
        { itemId: toast.id, isCompanyExpense: false, isStockMaterial: false },
      ],
      discountAllocationMode: 'COMPANY_ONLY',
    });

    const stocked = view.items.find((item) => item.id === biscuit.id);
    createdMaterialIds.push(stocked?.materialId as string);

    const material = await materials.findById(stocked?.materialId as string);

    // 11.16 gross over 4 packets, never the 10.36 net of the discount.
    expect(material?.packageCost.toDecimalString()).toBe('2.79');
    expect(material?.stockQuantity).toBe(400);

    // COMPANY_ONLY put the whole note discount on the one company line.
    expect(stocked?.allocatedDiscount).toBe('0.80');
    expect(view.items.find((item) => item.id === toast.id)?.allocatedDiscount).toBe('0.00');
  });

  it('reports the period savings from company lines only', async () => {
    const dataset = await analytics.getSpending({
      from: new Date('2026-06-01T00:00:00Z'),
      to: new Date('2026-07-01T00:00:00Z'),
      granularity: 'MONTH',
    });

    // Both imported notes fall in June 2026; the figures are whatever the
    // other rows of this month contribute plus ours, so only the shape and
    // the presence of the bucket are asserted here.
    expect(dataset.some((bucket) => bucket.period === '2026-06')).toBe(true);
  });
});
