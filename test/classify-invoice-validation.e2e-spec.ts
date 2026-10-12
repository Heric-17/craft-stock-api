import type { Server } from 'node:http';

import { HttpStatus, type INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/shared/infrastructure/prisma/prisma.service';
import { authenticate } from './support/authenticate';
import { configureTestApp } from './support/configure-test-app';

interface ValidationFieldError {
  path: string;
  constraints: string[];
}

/**
 * `packageQuantity` and `minimumStockAlert` are `Decimal(12,3)` columns. A
 * value with a fourth decimal place used to pass validation and be truncated
 * by the database without a word; it is now refused, like every other
 * three-decimal quantity in the API.
 *
 * Validation runs before the service, so the purchase does not have to exist.
 */
describe('Invoice classification, decimal places (e2e)', () => {
  let app: INestApplication;
  let server: Server;
  let prisma: PrismaService;
  let authHeader: string;
  let actorUserId: string;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    configureTestApp(app, moduleRef);
    await app.init();
    server = app.getHttpServer() as Server;
    prisma = moduleRef.get(PrismaService);
    ({ authHeader, userId: actorUserId } = await authenticate(moduleRef, server));
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: actorUserId } });
    await app.close();
  });

  async function classify(item: Record<string, unknown>) {
    return request(server)
      .post('/invoices/purchases/not-a-real-purchase/classification')
      .set('Authorization', authHeader)
      .send({
        items: [{ itemId: 'item-1', isCompanyExpense: true, isStockMaterial: true, ...item }],
      });
  }

  it('refuses a packageQuantity with four decimal places, naming the field', async () => {
    const response = await classify({ materialId: 'm-1', packageQuantity: 1.2345 });

    expect(response.status).toBe(HttpStatus.BAD_REQUEST);

    const body = response.body as { code: string; details: ValidationFieldError[] };

    expect(body.code).toBe('VALIDATION_FAILED');
    expect(body.details.map((entry) => entry.path)).toEqual(['items.0.packageQuantity']);
  });

  it('refuses a minimumStockAlert with four decimal places, naming the field', async () => {
    const response = await classify({
      newMaterial: { name: 'Farinha', consumptionUnit: 'GRAM', minimumStockAlert: 0.0001 },
      packageQuantity: 1000,
    });

    expect(response.status).toBe(HttpStatus.BAD_REQUEST);

    const body = response.body as { details: ValidationFieldError[] };

    expect(body.details.map((entry) => entry.path)).toEqual([
      'items.0.newMaterial.minimumStockAlert',
    ]);
  });

  it('lets three decimal places through to the service, which then looks the purchase up', async () => {
    const response = await classify({ materialId: 'm-1', packageQuantity: 1.234 });

    // Past validation: what stops it now is that the purchase does not exist.
    expect(response.status).not.toBe(HttpStatus.BAD_REQUEST);
  });
});
