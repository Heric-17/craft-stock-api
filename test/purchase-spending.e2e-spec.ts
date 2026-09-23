import { randomUUID } from 'node:crypto';

import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';

import { AppModule } from '../src/app.module';
import { Material } from '../src/modules/materials/domain/material.entity';
import {
  MATERIAL_REPOSITORY,
  type MaterialRepository,
} from '../src/modules/materials/domain/repositories/material.repository';
import type {
  PurchaseView,
  RegisterInvoicePurchaseInput,
} from '../src/modules/purchases/application/dto/purchases.dto';
import { PurchaseAnalyticsService } from '../src/modules/purchases/application/services/purchase-analytics.service';
import { PurchaseEditingService } from '../src/modules/purchases/application/services/purchase-editing.service';
import { PurchasesService } from '../src/modules/purchases/application/services/purchases.service';
import { Money } from '../src/shared/domain/money/money';
import { PrismaService } from '../src/shared/infrastructure/prisma/prisma.service';

/**
 * Real-Postgres integration coverage for the cost/discount policy and for the
 * aggregated spending dataset: written through the real
 * `PrismaPurchaseRepository` and read back through the real
 * `PrismaPurchaseAnalyticsAdapter`, whose grouping no in-memory fake can
 * stand in for. Never mocks Prisma.
 */
describe('Purchase spending and discount policy (e2e)', () => {
  let app: INestApplication;
  let purchases: PurchasesService;
  let editing: PurchaseEditingService;
  let analytics: PurchaseAnalyticsService;
  let materials: MaterialRepository;
  let prisma: PrismaService;

  const createdPurchaseIds: string[] = [];
  const createdMaterialIds: string[] = [];

  // Each block of tests gets a window of its own, so rows written by another
  // test — or by another run — cannot land in the buckets it asserts on.
  const PERIOD = { from: new Date('2031-04-01T00:00:00Z'), to: new Date('2031-05-01T00:00:00Z') };
  const MIXED = { from: new Date('2032-01-01T00:00:00Z'), to: new Date('2032-02-01T00:00:00Z') };
  const SHOPS = { from: new Date('2033-03-01T00:00:00Z'), to: new Date('2033-04-01T00:00:00Z') };
  const QUARTER = { from: new Date('2034-01-01T00:00:00Z'), to: new Date('2034-04-01T00:00:00Z') };
  const SILENT = { from: new Date('2035-06-01T00:00:00Z'), to: new Date('2035-07-01T00:00:00Z') };
  const PARKED = { from: new Date('2038-02-01T00:00:00Z'), to: new Date('2038-03-01T00:00:00Z') };

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    purchases = moduleRef.get(PurchasesService);
    editing = moduleRef.get(PurchaseEditingService);
    analytics = moduleRef.get(PurchaseAnalyticsService);
    materials = moduleRef.get(MATERIAL_REPOSITORY);
    prisma = moduleRef.get(PrismaService);
  });

  afterAll(async () => {
    for (const purchaseId of createdPurchaseIds) {
      await prisma.purchaseItem.deleteMany({ where: { purchaseId } });
      await prisma.purchase.deleteMany({ where: { id: purchaseId } });
    }
    for (const materialId of createdMaterialIds) {
      await prisma.materialPriceHistory.deleteMany({ where: { materialId } });
      await prisma.material.deleteMany({ where: { id: materialId } });
    }

    await app.close();
  });

  async function seedMaterial(packageCost: string): Promise<Material> {
    const now = new Date();
    const material = new Material({
      id: randomUUID(),
      name: `Farinha ${randomUUID()}`,
      description: null,
      imageUrl: null,
      packageCost: Money.fromDecimalString(packageCost),
      packageQuantity: 1000,
      consumptionUnit: 'GRAM',
      stockQuantity: 0,
      minimumStockAlert: 0,
      discontinuedAt: null,
      createdAt: now,
      updatedAt: now,
    });

    await materials.save(material);
    createdMaterialIds.push(material.id);
    return material;
  }

  async function record(input: RegisterInvoicePurchaseInput): Promise<PurchaseView> {
    const view = await purchases.registerInvoicePurchase(input);
    createdPurchaseIds.push(view.id);
    return view;
  }

  it('records both sides of a discounted note and prices off the gross one', async () => {
    const material = await seedMaterial('10.00');

    const view = await record({
      purchaseDate: new Date('2031-04-10T12:00:00Z'),
      accessKey: null,
      rawInvoiceData: { source: 'e2e' },
      grossTotal: '30.00',
      discountTotal: '20.00',
      lines: [
        {
          description: 'Farinha 1kg',
          quantity: 1,
          unitPrice: '20.00',
          grossValue: '20.00',
          isCompanyExpense: true,
          materialId: material.id,
        },
        {
          description: 'Sacolas',
          quantity: 1,
          unitPrice: '10.00',
          grossValue: '10.00',
          isCompanyExpense: true,
          materialId: null,
        },
      ],
    });

    const rows = await prisma.purchaseItem.findMany({
      where: { purchaseId: view.id },
      orderBy: { description: 'asc' },
    });

    expect(rows.map((row) => row.grossValue.toString())).toEqual(['20', '10']);
    // A 20.00 discount over a 30.00 note: 13.33 lands on the 20.00 line and
    // 6.67 on the 10.00 one, and the two add up to exactly the note's
    // discount. netValue is not read back because it is not a column — it is
    // grossValue minus the attributed discount, derived on every read.
    expect(rows.map((row) => row.allocatedDiscount.toString())).toEqual(['13.33', '6.67']);
    expect(rows.map((row) => row.grossValue.minus(row.allocatedDiscount).toString())).toEqual([
      '6.67',
      '3.33',
    ]);

    // The cost of restocking is the 20.00 the package lists for, not the
    // 6.67 this one note happened to charge after its discount.
    const updated = await materials.findById(material.id);
    expect(updated?.packageCost.toDecimalString()).toBe('20.00');
  });

  it('aggregates spending from what was paid, and reports the discount as savings', async () => {
    await record({
      purchaseDate: new Date('2031-04-05T09:00:00Z'),
      accessKey: null,
      rawInvoiceData: null,
      grossTotal: '100.00',
      discountTotal: '13.00',
      lines: [
        {
          description: 'Açúcar',
          quantity: 1,
          unitPrice: '100.00',
          grossValue: '100.00',
          isCompanyExpense: true,
          materialId: null,
        },
      ],
    });

    await record({
      purchaseDate: new Date('2031-04-06T09:00:00Z'),
      accessKey: null,
      rawInvoiceData: null,
      grossTotal: '50.00',
      discountTotal: '0.00',
      lines: [
        {
          description: 'Manteiga',
          quantity: 1,
          unitPrice: '30.00',
          grossValue: '30.00',
          isCompanyExpense: true,
          materialId: null,
        },
        {
          description: 'Item pessoal',
          quantity: 1,
          unitPrice: '20.00',
          grossValue: '20.00',
          isCompanyExpense: false,
          materialId: null,
        },
      ],
    });

    const dataset = await analytics.getSpending({ ...PERIOD, granularity: 'MONTH' });

    // 87.00 paid on the discounted note, 30.00 of company expense on the
    // second one, and the 10.00 of the note the previous test left in the
    // same month. Their gross company-expense lines add up to 150.00: the
    // panel is meant to disagree with that, by exactly the 33.00 of discount.
    expect(dataset.byPeriod).toEqual([
      { period: '2031-04', netSpend: '127.00', discountTotal: '33.00', purchaseCount: 3 },
    ]);
  });

  it('buckets the same rows by day when asked for the finer dimension', async () => {
    const dataset = await analytics.getSpending({ ...PERIOD, granularity: 'DAY' });

    expect(dataset.byPeriod).toEqual([
      { period: '2031-04-05', netSpend: '87.00', discountTotal: '13.00', purchaseCount: 1 },
      { period: '2031-04-06', netSpend: '30.00', discountTotal: '0.00', purchaseCount: 1 },
      { period: '2031-04-10', netSpend: '10.00', discountTotal: '20.00', purchaseCount: 1 },
    ]);
  });

  it('reports a period with no purchases as empty dimensions, not as an error', async () => {
    const dataset = await analytics.getSpending({ ...SILENT, granularity: 'MONTH' });

    // A quiet month is a result. The screen has to be able to tell "spent
    // nothing" from "no data", and the dataset says the former plainly.
    expect(dataset.byPeriod).toEqual([]);
    expect(dataset.byEstablishment).toEqual([]);
    expect(dataset.granularity).toBe('MONTH');
  });

  it('moves the company spend between COMPANY_ONLY and PERSONAL_ONLY on a mixed note', async () => {
    // The note of the policy itself: flour for the business, wine for the
    // house, and 20.00 of discount the note does not say who it belongs to.
    const view = await record({
      purchaseDate: new Date('2032-01-15T09:00:00Z'),
      accessKey: null,
      rawInvoiceData: null,
      establishment: { name: 'ATACADAO S.A.', cnpj: '75.315.333/0088-60' },
      grossTotal: '120.00',
      discountTotal: '20.00',
      discountAllocationMode: 'COMPANY_ONLY',
      lines: [
        {
          description: 'Farinha',
          quantity: 1,
          unitPrice: '20.00',
          grossValue: '20.00',
          isCompanyExpense: true,
          materialId: null,
        },
        {
          description: 'Vinho',
          quantity: 1,
          unitPrice: '100.00',
          grossValue: '100.00',
          isCompanyExpense: false,
          materialId: null,
        },
      ],
    });

    const underCompanyOnly = await analytics.getSpending({ ...MIXED, granularity: 'MONTH' });

    // The whole discount landed on the flour: the business paid nothing for
    // it and saved 20.00.
    expect(underCompanyOnly.byPeriod).toEqual([
      { period: '2032-01', netSpend: '0.00', discountTotal: '20.00', purchaseCount: 1 },
    ]);

    await editing.setDiscountAllocation(view.id, { mode: 'PERSONAL_ONLY' });

    const underPersonalOnly = await analytics.getSpending({ ...MIXED, granularity: 'MONTH' });

    // Same note, and the business now paid the flour in full and saved
    // nothing — the discount was the wine's all along.
    expect(underPersonalOnly.byPeriod).toEqual([
      { period: '2032-01', netSpend: '20.00', discountTotal: '0.00', purchaseCount: 1 },
    ]);

    // What the card was charged did not move a cent between the two modes.
    // Attribution decides whose discount it was, never how much was paid.
    const header = await prisma.purchase.findUniqueOrThrow({ where: { id: view.id } });
    expect(header.grossTotal.toString()).toBe('120');
    expect(header.discountTotal.toString()).toBe('20');
    expect(header.netTotal.toString()).toBe('100');

    const lines = await prisma.purchaseItem.findMany({ where: { purchaseId: view.id } });
    const allocated = lines.reduce(
      (total, line) => total.plus(Money.fromDecimalString(line.allocatedDiscount.toString())),
      Money.zero(),
    );

    // And the lines still close over the note's discount exactly, which is
    // the invariant every mode is held to.
    expect(allocated.toDecimalString()).toBe('20.00');
  });

  it('groups a single establishment over a period into one bucket', async () => {
    for (const day of ['2033-03-04T10:00:00Z', '2033-03-18T10:00:00Z']) {
      await record({
        purchaseDate: new Date(day),
        accessKey: null,
        rawInvoiceData: null,
        establishment: { name: 'MERCADO SAO JOSE', cnpj: '11.222.333/0001-44' },
        grossTotal: '25.00',
        discountTotal: '5.00',
        lines: [
          {
            description: 'Fermento',
            quantity: 1,
            unitPrice: '25.00',
            grossValue: '25.00',
            isCompanyExpense: true,
            materialId: null,
          },
        ],
      });
    }

    const dataset = await analytics.getSpending({ ...SHOPS, granularity: 'MONTH' });

    expect(dataset.byEstablishment).toEqual([
      {
        establishmentId: '11.222.333/0001-44',
        establishmentName: 'MERCADO SAO JOSE',
        netSpend: '40.00',
        discountTotal: '10.00',
        purchaseCount: 2,
      },
    ]);
    // Two purchases in one bucket: the average ticket the panel shows is a
    // division the client does over these two figures, not an endpoint.
    expect(dataset.byPeriod).toEqual([
      { period: '2033-03', netSpend: '40.00', discountTotal: '10.00', purchaseCount: 2 },
    ]);
  });

  it('leaves a purchase with a pending manual attribution out of the dataset', async () => {
    const view = await record({
      purchaseDate: new Date('2038-02-12T09:00:00Z'),
      accessKey: null,
      rawInvoiceData: null,
      grossTotal: '100.00',
      discountTotal: '10.00',
      lines: [
        {
          description: 'Farinha',
          quantity: 1,
          unitPrice: '60.00',
          grossValue: '60.00',
          isCompanyExpense: true,
          materialId: null,
        },
        {
          description: 'Açúcar',
          quantity: 1,
          unitPrice: '40.00',
          grossValue: '40.00',
          isCompanyExpense: true,
          materialId: null,
        },
      ],
    });

    await editing.setDiscountAllocation(view.id, {
      mode: 'MANUAL',
      manualAllocation: [
        { itemId: view.items[0].id, allocatedDiscount: '10.00' },
        { itemId: view.items[1].id, allocatedDiscount: '0.00' },
      ],
    });

    // Removing the line that was holding the whole discount leaves nothing
    // the system can recompute, so the purchase waits for the user.
    const pending = await editing.removeItem(view.id, view.items[0].id);
    expect(pending.allocationPending).toBe(true);

    // And until they answer, the month is not reported at all. Reporting it
    // would show a period whose discount is only half attributed, with
    // nothing on screen saying so.
    const whilePending = await analytics.getSpending({ ...PARKED, granularity: 'MONTH' });
    expect(whilePending.byPeriod).toEqual([]);

    await editing.setDiscountAllocation(view.id, {
      mode: 'MANUAL',
      manualAllocation: [{ itemId: view.items[1].id, allocatedDiscount: '10.00' }],
    });

    const afterRestating = await analytics.getSpending({ ...PARKED, granularity: 'MONTH' });
    expect(afterRestating.byPeriod).toEqual([
      { period: '2038-02', netSpend: '30.00', discountTotal: '10.00', purchaseCount: 1 },
    ]);
  });

  it('spreads several months across the period dimension, in order', async () => {
    for (const [day, amount] of [
      ['2034-01-09T10:00:00Z', '11.00'],
      ['2034-02-09T10:00:00Z', '22.00'],
      ['2034-03-09T10:00:00Z', '33.00'],
    ]) {
      await record({
        purchaseDate: new Date(day),
        accessKey: null,
        rawInvoiceData: null,
        grossTotal: amount,
        discountTotal: '0.00',
        lines: [
          {
            description: 'Insumo',
            quantity: 1,
            unitPrice: amount,
            grossValue: amount,
            isCompanyExpense: true,
            materialId: null,
          },
        ],
      });
    }

    const dataset = await analytics.getSpending({ ...QUARTER, granularity: 'MONTH' });

    // The month-on-month curve is a read straight down this array. No
    // endpoint computes it, and adding one to the panel costs no backend
    // work at all.
    expect(dataset.byPeriod.map((bucket) => [bucket.period, bucket.netSpend])).toEqual([
      ['2034-01', '11.00'],
      ['2034-02', '22.00'],
      ['2034-03', '33.00'],
    ]);
  });
});
