import { randomUUID } from 'node:crypto';

import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';

import { AppModule } from '../src/app.module';
import { SalesService } from '../src/modules/sales/application/services/sales.service';
import {
  MATERIAL_REPOSITORY,
  type MaterialRepository,
} from '../src/modules/materials/domain/repositories/material.repository';
import { Material } from '../src/modules/materials/domain/material.entity';
import {
  SALE_REPOSITORY,
  type SaleRepository,
} from '../src/modules/sales/domain/repositories/sale.repository';
import { Money } from '../src/shared/domain/money/money';
import { PrismaService } from '../src/shared/infrastructure/prisma/prisma.service';

/**
 * Real-Postgres integration coverage for the Sales stock debit/reversal
 * rules. Never mocks Prisma: every repository here is the real
 * `Prisma*Repository`, run against the Dockerized Postgres from
 * docker-compose.yml, through the real `PrismaUnitOfWork`.
 */
describe('Sales stock debit (e2e)', () => {
  let app: INestApplication;
  let salesService: SalesService;
  let materials: MaterialRepository;
  let sales: SaleRepository;
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
    sales = moduleRef.get(SALE_REPOSITORY);
    prisma = moduleRef.get(PrismaService);
  });

  afterAll(async () => {
    // Real rows in a real database: clean up everything this file created,
    // in FK-safe order, regardless of which test created it.
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

  async function seedMaterial(stockQuantity: number): Promise<Material> {
    const now = new Date();
    const material = new Material({
      id: randomUUID(),
      name: `Farinha ${randomUUID()}`,
      description: null,
      imageUrl: null,
      packageCost: Money.fromDecimalString('10.00'),
      packageQuantity: 1000,
      consumptionUnit: 'GRAM',
      stockQuantity,
      minimumStockAlert: 0,
      discontinuedAt: null,
      createdAt: now,
      updatedAt: now,
    });

    await materials.save(material);
    createdMaterialIds.push(material.id);
    return material;
  }

  async function createSale(materialId: string, quantity: number) {
    const view = await salesService.create({
      customerName: 'Maria',
      customerContact: null,
      paymentMethod: 'PIX',
      // A loose-Material line has to state its margin; these cases are about
      // the stock debit, so they sell at cost.
      items: [{ materialId, quantity, marginPercent: 0 }],
    });
    createdSaleIds.push(view.id);
    return view;
  }

  it('debits exactly the needed quantity when stock is sufficient', async () => {
    const material = await seedMaterial(1000);
    const sale = await createSale(material.id, 300);

    await salesService.updateProductionStatus(sale.id, 'ASSEMBLED');

    const updated = await materials.findById(material.id);
    expect(updated?.stockQuantity).toBe(700);

    const snapshots = await sales.findStockMovementsBySaleId(sale.id);
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0].quantityDebited).toBe(300);
  });

  it('floors stock at zero instead of going negative when stock is insufficient', async () => {
    const material = await seedMaterial(100);
    const sale = await createSale(material.id, 300);

    await salesService.updateProductionStatus(sale.id, 'ASSEMBLED');

    const updated = await materials.findById(material.id);
    expect(updated?.stockQuantity).toBe(0);
    expect(updated?.stockQuantity).not.toBeLessThan(0);

    const snapshots = await sales.findStockMovementsBySaleId(sale.id);
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0].quantityDebited).toBe(100);
  });

  it('reverses a partial debit by returning exactly what was debited, not the original need', async () => {
    const material = await seedMaterial(100);
    const sale = await createSale(material.id, 300);

    await salesService.updateProductionStatus(sale.id, 'ASSEMBLED');
    const afterDebit = await materials.findById(material.id);
    expect(afterDebit?.stockQuantity).toBe(0);

    await salesService.updateProductionStatus(sale.id, 'PENDING');

    const afterReversal = await materials.findById(material.id);
    // The need was 300, but only 100 was ever debited. Reversal must give
    // back exactly the 100 debited, never the original 300 need.
    expect(afterReversal?.stockQuantity).toBe(100);

    const snapshots = await sales.findStockMovementsBySaleId(sale.id);
    expect(snapshots).toHaveLength(0);
  });

  it('does not debit twice across a repeated transition to ASSEMBLED', async () => {
    const material = await seedMaterial(1000);
    const sale = await createSale(material.id, 300);

    await salesService.updateProductionStatus(sale.id, 'ASSEMBLED');
    await salesService.updateProductionStatus(sale.id, 'DELIVERED');
    await salesService.updateProductionStatus(sale.id, 'ASSEMBLED');

    const updated = await materials.findById(material.id);
    expect(updated?.stockQuantity).toBe(700);

    const snapshots = await sales.findStockMovementsBySaleId(sale.id);
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0].quantityDebited).toBe(300);
  });
});
