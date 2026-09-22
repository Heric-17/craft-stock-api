import { randomUUID } from 'node:crypto';

import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';

import { AppModule } from '../src/app.module';
import { Material } from '../src/modules/materials/domain/material.entity';
import {
  MATERIAL_REPOSITORY,
  type MaterialRepository,
} from '../src/modules/materials/domain/repositories/material.repository';
import { SalesService } from '../src/modules/sales/application/services/sales.service';
import { Money } from '../src/shared/domain/money/money';
import { PrismaService } from '../src/shared/infrastructure/prisma/prisma.service';

/**
 * Real-Postgres coverage for the frozen price basis of a `SaleItem`.
 *
 * The unit tests prove the arithmetic; this file proves the pair survives the
 * round trip. `priceBasisQuantity` is a `Decimal(12,3)` column, and a 1 kg
 * package is a basis of 1000 — a truncation or a default of 1 anywhere in the
 * mapper would turn a R$ 3,36 line into R$ 3.360,00 or R$ 0,03 without any
 * arithmetic being wrong.
 */
describe('SaleItem price basis (e2e)', () => {
  let app: INestApplication;
  let salesService: SalesService;
  let materials: MaterialRepository;
  let prisma: PrismaService;

  const createdMaterialIds: string[] = [];
  const createdSaleIds: string[] = [];

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    salesService = moduleRef.get(SalesService);
    materials = moduleRef.get(MATERIAL_REPOSITORY);
    prisma = moduleRef.get(PrismaService);
  });

  afterAll(async () => {
    for (const saleId of createdSaleIds) {
      await prisma.stockMovementSnapshot.deleteMany({ where: { saleId } });
      await prisma.saleItem.deleteMany({ where: { saleId } });
      await prisma.sale.deleteMany({ where: { id: saleId } });
    }
    for (const materialId of createdMaterialIds) {
      await prisma.material.deleteMany({ where: { id: materialId } });
    }

    await app.close();
  });

  /** A 1 kg package at R$ 28,00, consumed by the gram. */
  async function seedFlour(): Promise<Material> {
    const now = new Date();
    const material = new Material({
      id: randomUUID(),
      name: `Farinha ${randomUUID()}`,
      description: null,
      imageUrl: null,
      packageCost: Money.fromDecimalString('28.00'),
      packageQuantity: 1000,
      consumptionUnit: 'GRAM',
      stockQuantity: 5000,
      minimumStockAlert: 0,
      discontinuedAt: null,
      createdAt: now,
      updatedAt: now,
    });

    await materials.save(material);
    createdMaterialIds.push(material.id);
    return material;
  }

  async function sell(materialId: string, quantity: number, marginPercent: number) {
    const view = await salesService.create({
      customerName: 'Maria',
      customerContact: null,
      paymentMethod: 'PIX',
      items: [{ materialId, quantity, marginPercent }],
    });
    createdSaleIds.push(view.id);
    return view;
  }

  it('charges R$ 3,36 for 120 g sold at cost, read back from the database', async () => {
    const flour = await seedFlour();
    const created = await sell(flour.id, 120, 0);

    // Re-read: this view is built from rows loaded by the Prisma repository
    // and its mapper, not from the entities created in memory above.
    const reread = await salesService.findById(created.id);

    expect(reread.items[0].priceBasisAmount).toBe('28.00');
    expect(reread.items[0].priceBasisQuantity).toBe(1000);
    expect(reread.items[0].unitPrice).toBe('0.0280');
    expect(reread.items[0].lineTotal).toBe('3.36');
    expect(reread.totalAmount).toBe('3.36');
  });

  it('charges R$ 5,04 for the same 120 g at a 50% margin', async () => {
    const flour = await seedFlour();
    const created = await sell(flour.id, 120, 50);

    const reread = await salesService.findById(created.id);

    expect(reread.items[0].priceBasisAmount).toBe('42.00');
    expect(reread.items[0].unitPrice).toBe('0.0420');
    expect(reread.items[0].lineTotal).toBe('5.04');
  });

  it('stores the basis quantity as the package quantity, not as one', async () => {
    const flour = await seedFlour();
    const created = await sell(flour.id, 120, 0);

    const row = await prisma.saleItem.findFirstOrThrow({ where: { saleId: created.id } });

    expect(row.priceBasisAmount.toString()).toBe('28');
    expect(row.priceBasisQuantity.toNumber()).toBe(1000);
  });

  it('keeps the stored basis when the quantity of the line changes', async () => {
    const flour = await seedFlour();
    const created = await sell(flour.id, 120, 50);

    const updated = await salesService.updateItemQuantity(created.id, created.items[0].id, 240);

    expect(updated.items[0].priceBasisAmount).toBe('42.00');
    expect(updated.items[0].priceBasisQuantity).toBe(1000);
    expect(updated.items[0].lineTotal).toBe('10.08');
  });

  it('keeps the stored basis when the Material gets more expensive afterwards', async () => {
    const flour = await seedFlour();
    const created = await sell(flour.id, 120, 0);

    await materials.save(flour.update({ packageCost: Money.fromDecimalString('35.00') }, new Date()));

    const reread = await salesService.findById(created.id);
    expect(reread.items[0].priceBasisAmount).toBe('28.00');
    expect(reread.items[0].lineTotal).toBe('3.36');
  });
});
