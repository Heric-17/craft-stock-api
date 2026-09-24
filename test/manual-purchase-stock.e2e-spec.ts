import type { Server } from 'node:http';

import { HttpStatus, type INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import type { ImportedInvoiceView } from '../src/modules/invoices/application/dto/invoices.dto';
import {
  MATERIAL_REPOSITORY,
  type MaterialRepository,
} from '../src/modules/materials/domain/repositories/material.repository';
import type { PurchaseView } from '../src/modules/purchases/application/dto/purchases.dto';
import { PrismaService } from '../src/shared/infrastructure/prisma/prisma.service';
import { authenticate } from './support/authenticate';

/**
 * A purchase typed in by hand becomes stock through the same classification
 * step an imported note goes through.
 *
 * Registering a purchase never moves stock on its own, from either source:
 * the quantity that enters stock is the note's quantity times what one
 * package holds, and only the user knows the second number. The till calls a
 * packet of cheese one packet while the kitchen measures it in grams. So the
 * step that asks for `packageQuantity` is the step that moves stock, and it
 * addresses a `Purchase` by id without caring where its lines came from.
 */
describe('Manual purchase becoming stock (e2e)', () => {
  let app: INestApplication;
  let server: Server;
  let materials: MaterialRepository;
  let prisma: PrismaService;
  let authHeader: string;
  let actorUserId: string;

  const createdPurchaseIds: string[] = [];
  const createdMaterialIds: string[] = [];

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
    server = app.getHttpServer() as Server;
    materials = moduleRef.get(MATERIAL_REPOSITORY);
    prisma = moduleRef.get(PrismaService);
    ({ authHeader, userId: actorUserId } = await authenticate(moduleRef, server));
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
    await prisma.user.deleteMany({ where: { id: actorUserId } });

    await app.close();
  });

  it('creates the Material and brings the quantity into stock', async () => {
    const created = await request(server)
      .post('/purchases')
      .set('Authorization', authHeader)
      .send({
        purchaseDate: '2039-04-02T10:00:00.000Z',
        establishment: { name: 'Feira do bairro' },
        lines: [
          {
            description: 'Farinha de trigo',
            quantity: 2,
            unit: 'PCT',
            unitPrice: '28.00',
            grossValue: '56.00',
            isCompanyExpense: true,
          },
        ],
      })
      .expect(HttpStatus.CREATED);

    const purchase = created.body as PurchaseView;
    createdPurchaseIds.push(purchase.id);

    // Straight after registering, the line is not stock and nothing moved.
    expect(purchase.items[0].isStockMaterial).toBe(false);

    const classified = await request(server)
      .post(`/invoices/purchases/${purchase.id}/classification`)
      .set('Authorization', authHeader)
      .send({
        items: [
          {
            itemId: purchase.items[0].id,
            isCompanyExpense: true,
            isStockMaterial: true,
            // The answer only the user has: one packet holds 1000 g.
            packageQuantity: 1000,
            newMaterial: { name: `Farinha ${purchase.id}`, consumptionUnit: 'GRAM' },
          },
        ],
      })
      .expect(HttpStatus.OK);

    const materialId = (classified.body as ImportedInvoiceView).items[0].materialId;
    expect(materialId).not.toBeNull();
    createdMaterialIds.push(materialId as string);

    const material = await materials.findById(materialId as string);

    // Two packets of 1000 g: 2000 g of the consumption unit.
    expect(material?.stockQuantity).toBe(2000);
    // And the package cost is the gross side of the line: 56.00 for two
    // packets is 28.00 each, which is what restocking costs.
    expect(material?.packageCost.toDecimalString()).toBe('28.00');
    expect(material?.consumptionUnit).toBe('GRAM');
  });

  it('adds to an existing Material when the line names one', async () => {
    const existing = await request(server)
      .post('/materials')
      .set('Authorization', authHeader)
      .send({
        name: `Açúcar ${Date.now()}`,
        packageCost: '10.00',
        packageQuantity: 1000,
        consumptionUnit: 'GRAM',
        stockQuantity: 500,
        minimumStockAlert: 0,
      })
      .expect(HttpStatus.CREATED);

    const materialId = (existing.body as { id: string }).id;
    createdMaterialIds.push(materialId);

    const created = await request(server)
      .post('/purchases')
      .set('Authorization', authHeader)
      .send({
        purchaseDate: '2039-04-03T10:00:00.000Z',
        lines: [
          {
            description: 'Açúcar 1kg',
            quantity: 3,
            unitPrice: '12.00',
            grossValue: '36.00',
            isCompanyExpense: true,
          },
        ],
      })
      .expect(HttpStatus.CREATED);

    const purchase = created.body as PurchaseView;
    createdPurchaseIds.push(purchase.id);

    await request(server)
      .post(`/invoices/purchases/${purchase.id}/classification`)
      .set('Authorization', authHeader)
      .send({
        items: [
          {
            itemId: purchase.items[0].id,
            isCompanyExpense: true,
            isStockMaterial: true,
            materialId,
            packageQuantity: 1000,
          },
        ],
      })
      .expect(HttpStatus.OK);

    const material = await materials.findById(materialId);

    // 500 g on hand plus three 1000 g packages.
    expect(material?.stockQuantity).toBe(3500);
    // The cost only ever climbs: 12.00 a package beats the 10.00 recorded.
    expect(material?.packageCost.toDecimalString()).toBe('12.00');
  });
});
