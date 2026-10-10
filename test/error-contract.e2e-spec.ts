import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';

import { HttpStatus, type INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import type { CompositeProductView } from '../src/modules/composite-products/application/dto/composite-products.dto';
import type { MaterialView } from '../src/modules/materials/application/dto/materials.dto';
import type {
  PurchaseDetailView,
  PurchaseView,
} from '../src/modules/purchases/application/dto/purchases.dto';
import { PrismaService } from '../src/shared/infrastructure/prisma/prisma.service';
import type { ErrorResponseBody } from '../src/shared/presentation/filters/all-exceptions.filter';
import { authenticate } from './support/authenticate';
import { configureTestApp } from './support/configure-test-app';

interface ValidationFieldError {
  path: string;
  constraints: string[];
}

/**
 * The published error contract, exercised over HTTP.
 *
 * Every message this API produces is in English and everyone using it reads
 * Portuguese, so the frontend translates — and it has to key that translation
 * off something that does not move when a sentence gets reworded. These tests
 * pin `code` and the shape of `details` for each documented failure, because
 * a client branching on them breaks silently otherwise: the screen just shows
 * untranslated English, on a path nobody is looking at.
 *
 * The table in docs/api-contract.md is the contract; this is what keeps the
 * running system matching it.
 */
describe('Error contract (e2e)', () => {
  let app: INestApplication;
  let server: Server;
  let prisma: PrismaService;
  let authHeader: string;

  const createdUserIds: string[] = [];
  const createdMaterialIds: string[] = [];
  const createdProductIds: string[] = [];
  const createdPurchaseIds: string[] = [];

  async function createMaterial(overrides: Record<string, unknown> = {}): Promise<MaterialView> {
    const response = await request(server)
      .post('/materials')
      .set('Authorization', authHeader)
      .send({
        name: `Farinha ${randomUUID()}`,
        description: null,
        packageCost: '28.00',
        packageQuantity: 1000,
        consumptionUnit: 'GRAM',
        stockQuantity: 0,
        minimumStockAlert: 0,
        ...overrides,
      })
      .expect(HttpStatus.CREATED);

    const material = response.body as MaterialView;
    createdMaterialIds.push(material.id);

    return material;
  }

  async function createProductUsing(materialId: string): Promise<CompositeProductView> {
    const response = await request(server)
      .post('/composite-products')
      .set('Authorization', authHeader)
      .send({
        name: `Bolo ${randomUUID()}`,
        description: null,
        fixedOperationalCost: '5.00',
        profitMargin: 50,
        billOfMaterials: [{ materialId, quantity: 120 }],
      })
      .expect(HttpStatus.CREATED);

    const product = response.body as CompositeProductView;
    createdProductIds.push(product.id);

    return product;
  }

  function errorOf(response: request.Response): ErrorResponseBody {
    return response.body as ErrorResponseBody;
  }

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    configureTestApp(app, moduleRef);
    await app.init();
    server = app.getHttpServer() as Server;
    prisma = moduleRef.get(PrismaService);

    const actor = await authenticate(moduleRef, server);
    authHeader = actor.authHeader;
    createdUserIds.push(actor.userId);
  });

  afterAll(async () => {
    // Real rows in a real database, and every history FK is `Restrict` (§9),
    // so the order here is the FK order: items before their parent, recipes
    // before the Material they consume.
    for (const purchaseId of createdPurchaseIds) {
      await prisma.purchaseItem.deleteMany({ where: { purchaseId } });
      await prisma.purchase.deleteMany({ where: { id: purchaseId } });
    }

    for (const compositeProductId of createdProductIds) {
      const bom = await prisma.billOfMaterials.findUnique({ where: { compositeProductId } });

      if (bom !== null) {
        await prisma.bomItem.deleteMany({ where: { billOfMaterialsId: bom.id } });
        await prisma.billOfMaterials.delete({ where: { id: bom.id } });
      }

      await prisma.compositeProduct.deleteMany({ where: { id: compositeProductId } });
    }

    // `MaterialPriceHistory` belongs to the Material's own aggregate but its
    // FK is `Restrict` like every other (§9), and creating a Material
    // through the API writes a CREATION entry — so it goes first.
    await prisma.materialPriceHistory.deleteMany({
      where: { materialId: { in: createdMaterialIds } },
    });
    await prisma.material.deleteMany({ where: { id: { in: createdMaterialIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await app.close();
  });

  describe('every error response', () => {
    function getMissingMaterial(): request.Test {
      return request(server).get(`/materials/${randomUUID()}`).set('Authorization', authHeader);
    }

    it('carries a SCREAMING_SNAKE_CASE code', async () => {
      const response = await getMissingMaterial();

      expect(response.status).toBeGreaterThanOrEqual(HttpStatus.BAD_REQUEST);
      expect(errorOf(response).code).toMatch(/^[A-Z][A-Z0-9_]*$/);
    });

    it('keeps the English message for the log, alongside the code', async () => {
      const response = await getMissingMaterial();

      const body = errorOf(response);
      expect(body.code).toBe('MATERIAL_NOT_FOUND');
      expect(typeof body.message).toBe('string');
      expect(body.error).toBe('MaterialNotFoundError');
    });

    it('codes an unmatched route from the status', async () => {
      const response = await request(server).get('/does-not-exist');

      expect(response.status).toBe(HttpStatus.NOT_FOUND);
      expect(errorOf(response).code).toBe('NOT_FOUND');
    });

    it('codes a missing bearer token as UNAUTHORIZED', async () => {
      const response = await request(server).get('/materials');

      expect(response.status).toBe(HttpStatus.UNAUTHORIZED);
      expect(errorOf(response).code).toBe('UNAUTHORIZED');
    });
  });

  describe('VALIDATION_FAILED', () => {
    it('reports the DTO field path of each violation', async () => {
      const response = await request(server)
        .post('/materials')
        .set('Authorization', authHeader)
        .send({
          name: '',
          packageCost: 'not a decimal',
          packageQuantity: 1000,
          consumptionUnit: 'GRAM',
          stockQuantity: 0,
          minimumStockAlert: 0,
        })
        .expect(HttpStatus.BAD_REQUEST);

      const body = errorOf(response);
      expect(body.code).toBe('VALIDATION_FAILED');

      const details = body.details as ValidationFieldError[];
      expect(details.map((entry) => entry.path).sort()).toEqual(['name', 'packageCost']);
      for (const entry of details) {
        expect(Array.isArray(entry.constraints)).toBe(true);
        expect(entry.constraints.length).toBeGreaterThan(0);
      }
    });

    /**
     * The path has to match the DTO property, index and all, or the screen
     * cannot mark the field the user has to fix.
     */
    it('indexes into a nested array to name the offending field', async () => {
      const response = await request(server)
        .post('/composite-products')
        .set('Authorization', authHeader)
        .send({
          name: 'Bolo',
          fixedOperationalCost: '5.00',
          profitMargin: 50,
          billOfMaterials: [{ materialId: 'not-a-uuid', quantity: -1 }],
        })
        .expect(HttpStatus.BAD_REQUEST);

      const details = errorOf(response).details as ValidationFieldError[];
      expect(details.map((entry) => entry.path)).toEqual(
        expect.arrayContaining([expect.stringMatching(/^billOfMaterials\.0\./)]),
      );
    });

    it('names an unknown property rather than dropping it silently', async () => {
      const response = await request(server)
        .post('/materials')
        .set('Authorization', authHeader)
        .send({
          name: 'Farinha',
          packageCost: '28.00',
          packageQuantity: 1000,
          consumptionUnit: 'GRAM',
          stockQuantity: 0,
          minimumStockAlert: 0,
          imageUrl: 'https://attacker.example/evil.png',
        })
        .expect(HttpStatus.BAD_REQUEST);

      const details = errorOf(response).details as ValidationFieldError[];
      expect(details.map((entry) => entry.path)).toContain('imageUrl');
    });
  });

  describe('ENTITY_IN_USE', () => {
    it('breaks the references down by kind, with the total', async () => {
      const material = await createMaterial();
      await createProductUsing(material.id);

      const response = await request(server)
        .delete(`/materials/${material.id}`)
        .set('Authorization', authHeader)
        .expect(HttpStatus.UNPROCESSABLE_ENTITY);

      const body = errorOf(response);
      expect(body.code).toBe('ENTITY_IN_USE');
      expect(body.details).toEqual({
        entityName: 'Material',
        entityId: material.id,
        saleItems: 0,
        bomItems: 1,
        purchaseItems: 0,
        stockMovements: 0,
        total: 1,
      });
    });

    /**
     * Nothing references this product, so deleting it is a real delete — and
     * its own bill of materials does not count as a blocking reference, being
     * part of the same aggregate (§9).
     */
    it('does not refuse a CompositeProduct nothing references', async () => {
      const material = await createMaterial();
      const product = await createProductUsing(material.id);

      await request(server)
        .delete(`/composite-products/${product.id}`)
        .set('Authorization', authHeader)
        .expect(HttpStatus.NO_CONTENT);

      createdProductIds.splice(createdProductIds.indexOf(product.id), 1);
    });
  });

  describe('CONSUMPTION_UNIT_LOCKED', () => {
    it('reports stock on hand as the reason', async () => {
      const material = await createMaterial({ stockQuantity: 500 });

      const response = await request(server)
        .patch(`/materials/${material.id}/consumption-unit`)
        .set('Authorization', authHeader)
        .send({ consumptionUnit: 'UNIT' })
        .expect(HttpStatus.UNPROCESSABLE_ENTITY);

      const body = errorOf(response);
      expect(body.code).toBe('CONSUMPTION_UNIT_LOCKED');
      expect(body.details).toEqual({
        materialId: material.id,
        reason: 'STOCK_ON_HAND',
        stockQuantity: 500,
        bomItemReferences: 0,
      });
    });

    it('reports recipe use as the reason, and counts the lines', async () => {
      const material = await createMaterial({ stockQuantity: 0 });
      await createProductUsing(material.id);

      const response = await request(server)
        .patch(`/materials/${material.id}/consumption-unit`)
        .set('Authorization', authHeader)
        .send({ consumptionUnit: 'UNIT' })
        .expect(HttpStatus.UNPROCESSABLE_ENTITY);

      expect(errorOf(response).details).toEqual({
        materialId: material.id,
        reason: 'BOM_REFERENCES',
        stockQuantity: 0,
        bomItemReferences: 1,
      });
    });
  });

  describe('discount allocation', () => {
    async function purchaseWithDiscount(): Promise<PurchaseView> {
      const response = await request(server)
        .post('/purchases')
        .set('Authorization', authHeader)
        .send({
          purchaseDate: '2037-08-09T10:00:00.000Z',
          discountTotal: '10.00',
          lines: [
            {
              description: 'Farinha',
              quantity: 1,
              unitPrice: '60.00',
              grossValue: '60.00',
              isCompanyExpense: true,
            },
            {
              description: 'Açúcar',
              quantity: 1,
              unitPrice: '40.00',
              grossValue: '40.00',
              isCompanyExpense: true,
            },
          ],
        })
        .expect(HttpStatus.CREATED);

      const purchase = response.body as PurchaseView;
      createdPurchaseIds.push(purchase.id);

      return purchase;
    }

    it('reports a manual sum that does not close, with both figures as decimal strings', async () => {
      const purchase = await purchaseWithDiscount();

      const response = await request(server)
        .patch(`/purchases/${purchase.id}/discount-allocation`)
        .set('Authorization', authHeader)
        .send({
          mode: 'MANUAL',
          manualAllocation: [
            { itemId: purchase.items[0].id, allocatedDiscount: '3.00' },
            { itemId: purchase.items[1].id, allocatedDiscount: '3.00' },
          ],
        })
        .expect(HttpStatus.UNPROCESSABLE_ENTITY);

      const body = errorOf(response);
      expect(body.code).toBe('DISCOUNT_ALLOCATION');
      expect(body.details).toMatchObject({
        reason: 'SUM_MISMATCH',
        expected: '10.00',
        provided: '6.00',
      });
    });

    it('reports which line was given more discount than it is worth', async () => {
      // A discount bigger than the smaller line, so putting it all there
      // breaks the per-line ceiling.
      const response = await request(server)
        .post('/purchases')
        .set('Authorization', authHeader)
        .send({
          purchaseDate: '2037-08-09T10:00:00.000Z',
          discountTotal: '50.00',
          lines: [
            {
              description: 'Farinha',
              quantity: 1,
              unitPrice: '60.00',
              grossValue: '60.00',
              isCompanyExpense: true,
            },
            {
              description: 'Açúcar',
              quantity: 1,
              unitPrice: '40.00',
              grossValue: '40.00',
              isCompanyExpense: true,
            },
          ],
        })
        .expect(HttpStatus.CREATED);

      const purchase = response.body as PurchaseView;
      createdPurchaseIds.push(purchase.id);

      const refused = await request(server)
        .patch(`/purchases/${purchase.id}/discount-allocation`)
        .set('Authorization', authHeader)
        .send({
          mode: 'MANUAL',
          manualAllocation: [
            { itemId: purchase.items[0].id, allocatedDiscount: '0.00' },
            { itemId: purchase.items[1].id, allocatedDiscount: '50.00' },
          ],
        })
        .expect(HttpStatus.UNPROCESSABLE_ENTITY);

      const body = errorOf(refused);
      expect(body.code).toBe('DISCOUNT_ALLOCATION');
      expect(body.details).toMatchObject({
        reason: 'LINE_EXCEEDS_GROSS',
        itemId: purchase.items[1].id,
        expected: '40.00',
        provided: '50.00',
      });
    });

    it('reports a pending manual attribution with the expected and current sums', async () => {
      const purchase = await purchaseWithDiscount();

      await request(server)
        .patch(`/purchases/${purchase.id}/discount-allocation`)
        .set('Authorization', authHeader)
        .send({
          mode: 'MANUAL',
          manualAllocation: [
            { itemId: purchase.items[0].id, allocatedDiscount: '10.00' },
            { itemId: purchase.items[1].id, allocatedDiscount: '0.00' },
          ],
        })
        .expect(HttpStatus.OK);

      const pending = await request(server)
        .delete(`/purchases/${purchase.id}/items/${purchase.items[0].id}`)
        .set('Authorization', authHeader)
        .expect(HttpStatus.OK);

      expect((pending.body as PurchaseDetailView).allocationPending).toBe(true);

      const response = await request(server)
        .post(`/purchases/${purchase.id}/complete-edit`)
        .set('Authorization', authHeader)
        .expect(HttpStatus.UNPROCESSABLE_ENTITY);

      const body = errorOf(response);
      expect(body.code).toBe('PENDING_DISCOUNT_ALLOCATION');
      expect(body.details).toEqual({
        purchaseId: purchase.id,
        expected: '10.00',
        provided: '0.00',
      });
    });

    it('reports a mode with no eligible line, naming the mode', async () => {
      const purchase = await purchaseWithDiscount();

      const response = await request(server)
        .patch(`/purchases/${purchase.id}/discount-allocation`)
        .set('Authorization', authHeader)
        .send({ mode: 'PERSONAL_ONLY' })
        .expect(HttpStatus.UNPROCESSABLE_ENTITY);

      const body = errorOf(response);
      expect(body.code).toBe('DISCOUNT_ALLOCATION');
      expect(body.details).toMatchObject({
        reason: 'NO_ELIGIBLE_LINE',
        mode: 'PERSONAL_ONLY',
      });
    });

    /** §8.1: money leaves the API as a decimal string, never a JSON number. */
    it('never puts a JSON number where money belongs in details', async () => {
      const purchase = await purchaseWithDiscount();

      const response = await request(server)
        .patch(`/purchases/${purchase.id}/discount-allocation`)
        .set('Authorization', authHeader)
        .send({
          mode: 'MANUAL',
          manualAllocation: [{ itemId: purchase.items[0].id, allocatedDiscount: '1.00' }],
        })
        .expect(HttpStatus.UNPROCESSABLE_ENTITY);

      const details = errorOf(response).details as Record<string, unknown>;
      for (const key of ['expected', 'provided']) {
        if (details[key] !== undefined) {
          expect(typeof details[key]).toBe('string');
        }
      }
    });
  });

  describe('INVALID_REFRESH_TOKEN', () => {
    it('is the code for a refresh with no cookie', async () => {
      const response = await request(server).post('/auth/refresh').expect(HttpStatus.UNAUTHORIZED);

      expect(errorOf(response).code).toBe('INVALID_REFRESH_TOKEN');
    });
  });

  describe('INVALID_CREDENTIALS', () => {
    it('is the code for a wrong password, and says nothing more', async () => {
      const response = await request(server)
        .post('/auth/login')
        .send({ email: `nobody-${randomUUID()}@craftstock.dev`, password: 'wrong password' })
        .expect(HttpStatus.UNAUTHORIZED);

      const body = errorOf(response);
      expect(body.code).toBe('INVALID_CREDENTIALS');
      // Which half was wrong is deliberately not disclosed.
      expect(body).not.toHaveProperty('details');
    });
  });
});
