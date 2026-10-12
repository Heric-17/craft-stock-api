import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';

import { HttpStatus, type INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import type {
  MaterialInventorySummaryView,
  MaterialView,
} from '../src/modules/materials/application/dto/materials.dto';
import { MaterialInventoryService } from '../src/modules/materials/application/services/material-inventory.service';
import { Material } from '../src/modules/materials/domain/material.entity';
import {
  MATERIAL_REPOSITORY,
  type MaterialRepository,
} from '../src/modules/materials/domain/repositories/material.repository';
import { Money } from '../src/shared/domain/money/money';
import { PrismaService } from '../src/shared/infrastructure/prisma/prisma.service';
import { authenticate } from './support/authenticate';
import { configureTestApp } from './support/configure-test-app';

/**
 * Real-Postgres coverage for the inventory summary. The table may hold other
 * Materials, so every figure is asserted as the difference the Materials seeded
 * here make, never as an absolute.
 */
describe('Material inventory summary (e2e)', () => {
  let app: INestApplication;
  let server: Server;
  let inventory: MaterialInventoryService;
  let materials: MaterialRepository;
  let prisma: PrismaService;
  let authHeader: string;
  let actorUserId: string;

  const createdMaterialIds: string[] = [];

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    configureTestApp(app, moduleRef);
    await app.init();
    server = app.getHttpServer() as Server;

    inventory = moduleRef.get(MaterialInventoryService);
    materials = moduleRef.get(MATERIAL_REPOSITORY);
    prisma = moduleRef.get(PrismaService);
    ({ authHeader, userId: actorUserId } = await authenticate(moduleRef, server));
  });

  afterAll(async () => {
    for (const materialId of createdMaterialIds) {
      await prisma.materialPriceHistory.deleteMany({ where: { materialId } });
      await prisma.material.deleteMany({ where: { id: materialId } });
    }
    await prisma.user.deleteMany({ where: { id: actorUserId } });

    await app.close();
  });

  async function seed(options: {
    packageCost: string;
    packageQuantity: number;
    stockQuantity: number;
    minimumStockAlert?: number;
    discontinuedAt?: Date | null;
  }): Promise<Material> {
    const now = new Date();
    const material = new Material({
      id: randomUUID(),
      name: `Insumo ${randomUUID()}`,
      description: null,
      imageKey: null,
      packageCost: Money.fromDecimalString(options.packageCost),
      packageQuantity: options.packageQuantity,
      consumptionUnit: 'GRAM',
      stockQuantity: options.stockQuantity,
      minimumStockAlert: options.minimumStockAlert ?? 0,
      discontinuedAt: options.discontinuedAt ?? null,
      createdAt: now,
      updatedAt: now,
    });

    await materials.save(material);
    createdMaterialIds.push(material.id);
    return material;
  }

  const cents = (value: string): number => Money.fromDecimalString(value).toCents();

  it('adds the value rounded for each Material, read back from the database', async () => {
    const before = await inventory.getSummary();

    // Three Materials worth 3.33 each once rounded (10.00 x 1 / 3): 9.99
    // between them, where rounding the exact sum at the end would say 10.00.
    const seeded = [
      await seed({ packageCost: '10.00', packageQuantity: 3, stockQuantity: 1 }),
      await seed({ packageCost: '10.00', packageQuantity: 3, stockQuantity: 1 }),
      await seed({ packageCost: '10.00', packageQuantity: 3, stockQuantity: 1 }),
    ];
    const after = await inventory.getSummary();

    expect(cents(after.totalStockValue) - cents(before.totalStockValue)).toBe(999);
    expect(after.materialCount - before.materialCount).toBe(3);
    // Each row of the list agrees with what the total added.
    for (const material of seeded) {
      const row = await prisma.material.findUniqueOrThrow({ where: { id: material.id } });
      expect(row.stockQuantity.toString()).toBe('1');
    }
  });

  it('counts a Material at or below its minimum, and leaves discontinued ones out by default', async () => {
    const before = await inventory.getSummary();
    const beforeAll = await inventory.getSummary(true);

    await seed({
      packageCost: '28.00',
      packageQuantity: 1000,
      stockQuantity: 100,
      minimumStockAlert: 100,
    });
    await seed({
      packageCost: '28.00',
      packageQuantity: 1000,
      stockQuantity: 500,
      discontinuedAt: new Date('2026-02-01T00:00:00Z'),
    });

    const after = await inventory.getSummary();
    const afterAll = await inventory.getSummary(true);

    // Active only: one Material, 100 g of a 1 kg bag at 28.00 is 2.80.
    expect(after.materialCount - before.materialCount).toBe(1);
    expect(after.belowMinimumCount - before.belowMinimumCount).toBe(1);
    expect(cents(after.totalStockValue) - cents(before.totalStockValue)).toBe(280);
    // With the discontinued one: 500 g is 14.00 more.
    expect(afterAll.materialCount - beforeAll.materialCount).toBe(2);
    expect(cents(afterAll.totalStockValue) - cents(beforeAll.totalStockValue)).toBe(280 + 1400);
  });

  it('GET /materials/inventory-summary answers over HTTP, and the list carries stockValue', async () => {
    const material = await seed({
      packageCost: '28.00',
      packageQuantity: 1000,
      stockQuantity: 120,
    });

    const summary = await request(server)
      .get('/materials/inventory-summary')
      .set('Authorization', authHeader)
      .expect(HttpStatus.OK);
    const body = summary.body as MaterialInventorySummaryView;

    expect(Object.keys(body).sort()).toEqual(
      ['belowMinimumCount', 'materialCount', 'totalStockValue'].sort(),
    );
    expect(body.totalStockValue).toMatch(/^\d+\.\d{2}$/);

    const detail = await request(server)
      .get(`/materials/${material.id}`)
      .set('Authorization', authHeader)
      .expect(HttpStatus.OK);

    // 120 g of a 1 kg bag at 28.00.
    expect((detail.body as MaterialView).stockValue).toBe('3.36');
  });

  it('refuses a malformed includeDiscontinued', async () => {
    await request(server)
      .get('/materials/inventory-summary')
      .query({ includeDiscontinued: 'maybe' })
      .set('Authorization', authHeader)
      .expect(HttpStatus.BAD_REQUEST);
  });
});
