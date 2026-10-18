import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';

import { HttpStatus, type INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';

import { AppModule } from '../src/app.module';
import { Material } from '../src/modules/materials/domain/material.entity';
import {
  MATERIAL_REPOSITORY,
  type MaterialRepository,
} from '../src/modules/materials/domain/repositories/material.repository';
import type { ShoppingListView } from '../src/modules/sales/application/dto/sales.dto';
import { SalesService } from '../src/modules/sales/application/services/sales.service';
import { Money } from '../src/shared/domain/money/money';
import { PrismaService } from '../src/shared/infrastructure/prisma/prisma.service';
import { authenticate } from './support/authenticate';
import { configureTestApp } from './support/configure-test-app';
import { api } from './support/api';

/** The shopping list with the purchase estimate, read back through the real repositories. */
describe('Shopping list estimate (e2e)', () => {
  let app: INestApplication;
  let server: Server;
  let sales: SalesService;
  let materials: MaterialRepository;
  let prisma: PrismaService;
  let authHeader: string;
  let actorUserId: string;

  const createdMaterialIds: string[] = [];
  const createdSaleIds: string[] = [];

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    configureTestApp(app, moduleRef);
    await app.init();
    server = app.getHttpServer() as Server;

    sales = moduleRef.get(SalesService);
    materials = moduleRef.get(MATERIAL_REPOSITORY);
    prisma = moduleRef.get(PrismaService);
    ({ authHeader, userId: actorUserId } = await authenticate(moduleRef, server));
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
    await prisma.user.deleteMany({ where: { id: actorUserId } });

    await app.close();
  });

  async function seed(packageCost: string, stockQuantity: number): Promise<Material> {
    const now = new Date();
    const material = new Material({
      id: randomUUID(),
      name: `Insumo ${randomUUID()}`,
      description: null,
      imageKey: null,
      packageCost: Money.fromDecimalString(packageCost),
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

  async function sell(items: { materialId: string; quantity: number }[]): Promise<string> {
    const view = await sales.create({
      customerName: 'Maria',
      customerContact: null,
      paymentMethod: 'PIX',
      items: items.map((item) => ({ ...item, marginBasisPoints: 0 })),
    });
    createdSaleIds.push(view.id);
    return view.id;
  }

  it('estimates whole packages and totals them, over HTTP', async () => {
    const flour = await seed('28.00', 0);
    const sugar = await seed('4.50', 800);
    const saleId = await sell([
      { materialId: flour.id, quantity: 1500 },
      { materialId: sugar.id, quantity: 900 },
    ]);

    const response = await api(server)
      .post('/sales/shopping-list')
      .set('Authorization', authHeader)
      .send({ saleIds: [saleId] })
      .expect(HttpStatus.OK);
    const body = response.body as ShoppingListView;
    const line = (id: string) => body.lines.find((candidate) => candidate.materialId === id);

    // 1500 g missing of 1 kg bags is 2 bags; 100 g missing is a whole bag.
    expect(line(flour.id)).toEqual(
      expect.objectContaining({ shortage: 1500, packagesToBuy: 2, estimatedCost: '56.00' }),
    );
    expect(line(sugar.id)).toEqual(
      expect.objectContaining({ shortage: 100, packagesToBuy: 1, estimatedCost: '4.50' }),
    );
    expect(body.estimatedTotal).toBe('60.50');
    expect(body.unestimatedLineCount).toBe(0);
  });

  it('flags a Material with no package cost instead of reading it as free', async () => {
    const free = await seed('0.00', 0);
    const flour = await seed('28.00', 0);
    const saleId = await sell([
      { materialId: free.id, quantity: 100 },
      { materialId: flour.id, quantity: 100 },
    ]);

    const response = await api(server)
      .post('/sales/shopping-list')
      .set('Authorization', authHeader)
      .send({ saleIds: [saleId] })
      .expect(HttpStatus.OK);
    const body = response.body as ShoppingListView;

    expect(body.lines.find((line) => line.materialId === free.id)).toEqual(
      expect.objectContaining({
        packagesToBuy: 1,
        estimatedCost: null,
        estimateIssue: 'MISSING_PACKAGE_DATA',
      }),
    );
    expect(body.estimatedTotal).toBe('28.00');
    expect(body.unestimatedLineCount).toBe(1);
  });
});
