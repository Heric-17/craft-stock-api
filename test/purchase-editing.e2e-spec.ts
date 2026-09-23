import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';

import { AppModule } from '../src/app.module';
import type { PurchaseView } from '../src/modules/purchases/application/dto/purchases.dto';
import { PurchaseEditingService } from '../src/modules/purchases/application/services/purchase-editing.service';
import { PurchasesService } from '../src/modules/purchases/application/services/purchases.service';
import { PendingDiscountAllocationError } from '../src/modules/purchases/domain/purchase.error';
import { PrismaService } from '../src/shared/infrastructure/prisma/prisma.service';

/** The captured note, as the extraction froze it. */
const RAW_INVOICE = {
  merchantName: 'ATACADAO S.A.',
  cnpj: '75.315.333/0088-60',
  grossTotal: '100.00',
  discountTotal: '10.00',
  items: [
    { code: '7891', description: 'FARINHA TRIGO 1KG', quantity: 1, grossValue: '60.00' },
    { code: '7892', description: 'ACUCAR 1KG', quantity: 1, grossValue: '40.00' },
  ],
};

/**
 * Real-Postgres coverage for editing a purchase: the immutability of the
 * captured note checked against the column itself, and the paging of the
 * history checked against the real query rather than against a fake that
 * sorts an array.
 */
describe('Purchase editing and history (e2e)', () => {
  let app: INestApplication;
  let purchases: PurchasesService;
  let editing: PurchaseEditingService;
  let prisma: PrismaService;

  const createdPurchaseIds: string[] = [];
  const HISTORY = { from: new Date('2036-05-01T00:00:00Z'), to: new Date('2036-06-01T00:00:00Z') };

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    purchases = moduleRef.get(PurchasesService);
    editing = moduleRef.get(PurchaseEditingService);
    prisma = moduleRef.get(PrismaService);
  });

  afterAll(async () => {
    for (const purchaseId of createdPurchaseIds) {
      await prisma.purchaseItem.deleteMany({ where: { purchaseId } });
      await prisma.purchase.deleteMany({ where: { id: purchaseId } });
    }

    await app.close();
  });

  async function importedPurchase(discountTotal = '0.00'): Promise<PurchaseView> {
    const view = await purchases.registerInvoicePurchase({
      purchaseDate: new Date('2036-05-10T12:00:00Z'),
      accessKey: null,
      rawInvoiceData: structuredClone(RAW_INVOICE),
      establishment: { name: 'ATACADAO S.A.', cnpj: '75.315.333/0088-60' },
      grossTotal: '100.00',
      discountTotal,
      lines: [
        {
          code: '7891',
          description: 'FARINHA TRIGO 1KG',
          quantity: 1,
          unitPrice: '60.00',
          grossValue: '60.00',
          isCompanyExpense: true,
          materialId: null,
        },
        {
          code: '7892',
          description: 'ACUCAR 1KG',
          quantity: 1,
          unitPrice: '40.00',
          grossValue: '40.00',
          isCompanyExpense: true,
          materialId: null,
        },
      ],
    });

    createdPurchaseIds.push(view.id);
    return view;
  }

  it('leaves rawInvoiceData untouched in the database after the items are edited', async () => {
    const created = await importedPurchase();

    await editing.addItem(created.id, {
      description: 'SACOLA',
      quantity: 2,
      unitPrice: '1.50',
      grossValue: '3.00',
      isCompanyExpense: true,
      materialId: null,
    });
    await editing.changeItem(created.id, created.items[0].id, {
      quantity: 2,
      unitPrice: '30.00',
      grossValue: '60.00',
    });
    await editing.removeItem(created.id, created.items[1].id);

    const row = await prisma.purchase.findUniqueOrThrow({ where: { id: created.id } });

    // The lines are now a different purchase from the one the note describes:
    // one was added, one corrected and one removed, and the header followed
    // them down to 63.00.
    expect(row.grossTotal.toString()).toBe('63');

    // The note still says what it said when it was captured — including the
    // 100.00 total and the line that is no longer part of the purchase. This
    // is what the card statement is reconciled against, and if an edit could
    // move it, the discrepancy it exists to expose would simply disappear.
    expect(row.rawInvoiceData).toEqual(RAW_INVOICE);
  });

  it('refuses to close an edit that left a manual attribution pending', async () => {
    const created = await importedPurchase('10.00');

    await editing.setDiscountAllocation(created.id, {
      mode: 'MANUAL',
      manualAllocation: [
        { itemId: created.items[0].id, allocatedDiscount: '10.00' },
        { itemId: created.items[1].id, allocatedDiscount: '0.00' },
      ],
    });

    // Removing the line that was carrying the whole discount leaves nothing
    // the system can recompute: it has no way to know where those 10.00 go.
    const pending = await editing.removeItem(created.id, created.items[0].id);
    expect(pending.allocationPending).toBe(true);

    const parked = await prisma.purchase.findUniqueOrThrow({ where: { id: created.id } });
    expect(parked.allocationPending).toBe(true);
    // Still the captured note, even mid-edit.
    expect(parked.rawInvoiceData).toEqual(RAW_INVOICE);

    await expect(editing.completeEdit(created.id)).rejects.toThrow(PendingDiscountAllocationError);

    const restated = await editing.setDiscountAllocation(created.id, {
      mode: 'MANUAL',
      manualAllocation: [{ itemId: created.items[1].id, allocatedDiscount: '10.00' }],
    });

    expect(restated.allocationPending).toBe(false);
    await expect(editing.completeEdit(created.id)).resolves.toMatchObject({
      allocationPending: false,
    });
  });

  it('pages the history and filters it by period and establishment', async () => {
    const shops = [
      { day: '2036-05-02T10:00:00Z', name: 'MERCADO A', cnpj: '22.333.444/0001-55' },
      { day: '2036-05-03T10:00:00Z', name: 'MERCADO A', cnpj: '22.333.444/0001-55' },
      { day: '2036-05-04T10:00:00Z', name: 'Feira do bairro', cnpj: null },
    ];

    for (const shop of shops) {
      const view = await purchases.registerManualPurchase({
        purchaseDate: new Date(shop.day),
        establishment: { name: shop.name, cnpj: shop.cnpj },
        lines: [
          {
            description: 'Insumo',
            quantity: 1,
            unitPrice: '9.00',
            grossValue: '9.00',
            isCompanyExpense: true,
            materialId: null,
          },
        ],
      });

      createdPurchaseIds.push(view.id);
    }

    const firstPage = await purchases.list({ ...HISTORY, limit: 2, offset: 0 });
    const secondPage = await purchases.list({ ...HISTORY, limit: 2, offset: 2 });

    // Five purchases fall in this window: the three above and the two the
    // editing tests left behind.
    expect(firstPage.total).toBe(5);
    expect(firstPage.items).toHaveLength(2);
    expect(secondPage.offset).toBe(2);

    const pagedIds = [...firstPage.items, ...secondPage.items].map((item) => item.id);
    expect(new Set(pagedIds).size).toBe(pagedIds.length);

    const byCnpj = await purchases.list({
      ...HISTORY,
      establishmentId: '22.333.444/0001-55',
      limit: 20,
      offset: 0,
    });
    // A shop with no CNPJ is identified by the name the user typed, which is
    // the only identity a manual entry has.
    const byName = await purchases.list({
      ...HISTORY,
      establishmentId: 'Feira do bairro',
      limit: 20,
      offset: 0,
    });

    expect(byCnpj.total).toBe(2);
    expect(byName.total).toBe(1);
    expect(byName.items[0].hasInvoice).toBe(false);
  });

  it('hands back the detail with the captured note exactly as stored', async () => {
    const created = await importedPurchase();
    const detail = await purchases.getById(created.id);

    expect(detail.rawInvoiceData).toEqual(RAW_INVOICE);
    expect(detail.establishment).toEqual({
      id: '75.315.333/0088-60',
      name: 'ATACADAO S.A.',
      cnpj: '75.315.333/0088-60',
    });
  });
});
