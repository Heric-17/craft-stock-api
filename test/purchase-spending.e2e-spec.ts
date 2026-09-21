import { randomUUID } from 'node:crypto';

import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';

import { AppModule } from '../src/app.module';
import { Material } from '../src/modules/materials/domain/material.entity';
import {
  MATERIAL_REPOSITORY,
  type MaterialRepository,
} from '../src/modules/materials/domain/repositories/material.repository';
import { PurchaseAnalyticsService } from '../src/modules/purchases/application/services/purchase-analytics.service';
import { PurchasesService } from '../src/modules/purchases/application/services/purchases.service';
import { Money } from '../src/shared/domain/money/money';
import { PrismaService } from '../src/shared/infrastructure/prisma/prisma.service';

/**
 * Real-Postgres integration coverage for the cost/discount policy: the two
 * numbers of a purchase, written through the real `PrismaPurchaseRepository`
 * and read back through the real `PrismaPurchaseAnalyticsAdapter` — the raw
 * aggregation no in-memory fake can stand in for. Never mocks Prisma.
 */
describe('Purchase spending and discount policy (e2e)', () => {
  let app: INestApplication;
  let purchases: PurchasesService;
  let analytics: PurchaseAnalyticsService;
  let materials: MaterialRepository;
  let prisma: PrismaService;

  const createdPurchaseIds: string[] = [];
  const createdMaterialIds: string[] = [];

  // A window of its own, so concurrent rows from other runs cannot land in
  // the same buckets this file asserts on.
  const PERIOD = { from: new Date('2031-04-01T00:00:00Z'), to: new Date('2031-05-01T00:00:00Z') };

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    purchases = moduleRef.get(PurchasesService);
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

  it('records both sides of a discounted note and prices off the gross one', async () => {
    const material = await seedMaterial('10.00');

    const view = await purchases.registerInvoicePurchase({
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
    createdPurchaseIds.push(view.id);

    const rows = await prisma.purchaseItem.findMany({
      where: { purchaseId: view.id },
      orderBy: { description: 'asc' },
    });

    expect(rows.map((row) => row.grossValue.toString())).toEqual(['20', '10']);
    expect(rows.map((row) => row.netValue.toString())).toEqual(['6.67', '3.33']);

    // The cost of restocking is the 20.00 the package lists for, not the
    // 6.67 this one note happened to charge after its discount.
    const updated = await materials.findById(material.id);
    expect(updated?.packageCost.toDecimalString()).toBe('20.00');
  });

  it('aggregates spending from what was paid, and reports the discount as savings', async () => {
    const first = await purchases.registerInvoicePurchase({
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
    createdPurchaseIds.push(first.id);

    const second = await purchases.registerInvoicePurchase({
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
    createdPurchaseIds.push(second.id);

    const dataset = await analytics.getSpending({ ...PERIOD, granularity: 'MONTH' });

    // 87.00 paid on the discounted note, 30.00 of company expense on the
    // second one, and the 10.00 of the note the previous test left in the
    // same month. Their gross company-expense lines add up to 150.00: the
    // panel is meant to disagree with that, by exactly the 33.00 of discount.
    expect(dataset).toEqual([{ period: '2031-04', netSpend: '127.00', discountTotal: '33.00' }]);
  });

  it('buckets the same rows by day when asked for the finer dimension', async () => {
    const dataset = await analytics.getSpending({ ...PERIOD, granularity: 'DAY' });

    expect(dataset).toEqual([
      { period: '2031-04-05', netSpend: '87.00', discountTotal: '13.00' },
      { period: '2031-04-06', netSpend: '30.00', discountTotal: '0.00' },
      { period: '2031-04-10', netSpend: '10.00', discountTotal: '20.00' },
    ]);
  });
});
