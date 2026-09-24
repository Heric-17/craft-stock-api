import type { Server } from 'node:http';

import { HttpStatus, type INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import type {
  PurchaseDetailView,
  PurchasePageView,
  PurchaseView,
  SpendingDatasetView,
} from '../src/modules/purchases/application/dto/purchases.dto';
import { PrismaService } from '../src/shared/infrastructure/prisma/prisma.service';
import { authenticate } from './support/authenticate';

/**
 * The REST surface of the module, over HTTP, with the application's real
 * validation pipe and exception filter in place.
 */
describe('Purchases API (e2e)', () => {
  let app: INestApplication;
  let server: Server;
  let prisma: PrismaService;
  let authHeader: string;
  let actorUserId: string;

  const createdPurchaseIds: string[] = [];
  const PERIOD = { from: '2037-08-01T00:00:00.000Z', to: '2037-09-01T00:00:00.000Z' };

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
    server = app.getHttpServer() as Server;
    prisma = moduleRef.get(PrismaService);
    ({ authHeader, userId: actorUserId } = await authenticate(moduleRef, server));
  });

  afterAll(async () => {
    for (const purchaseId of createdPurchaseIds) {
      await prisma.purchaseItem.deleteMany({ where: { purchaseId } });
      await prisma.purchase.deleteMany({ where: { id: purchaseId } });
    }
    await prisma.user.deleteMany({ where: { id: actorUserId } });

    await app.close();
  });

  async function postManualPurchase(day: string, amount: string): Promise<PurchaseView> {
    const response = await request(server)
      .post('/purchases')
      .set('Authorization', authHeader)
      .send({
        purchaseDate: day,
        establishment: { name: 'MERCADO DO ZE', cnpj: '33.444.555/0001-66' },
        lines: [
          {
            description: 'Fermento biológico',
            quantity: 1,
            unitPrice: amount,
            grossValue: amount,
            isCompanyExpense: true,
          },
        ],
      })
      .expect(HttpStatus.CREATED);

    const body = response.body as PurchaseView;
    createdPurchaseIds.push(body.id);
    return body;
  }

  it('POST /purchases records a purchase with no note behind it', async () => {
    const body = await postManualPurchase('2037-08-04T10:00:00.000Z', '12.50');

    expect(body.accessKey).toBeNull();
    expect(body.grossTotal).toBe('12.50');
    expect(body.netTotal).toBe('12.50');
    expect(body.establishment).toEqual({
      id: '33.444.555/0001-66',
      name: 'MERCADO DO ZE',
      cnpj: '33.444.555/0001-66',
    });
    // Money travels as a decimal string, never as a JSON number: a float
    // read back as 0.1 and added up on the client reintroduces exactly the
    // error Money exists to prevent.
    expect(typeof body.items[0].grossValue).toBe('string');
  });

  it('POST /purchases refuses a body the DTO does not accept', async () => {
    await request(server)
      .post('/purchases')
      .set('Authorization', authHeader)
      .send({
        purchaseDate: 'não é uma data',
        lines: [],
      })
      .expect(HttpStatus.BAD_REQUEST);

    // A monetary amount given as a number is rejected rather than quietly
    // converted, for the same reason it is never returned as one.
    await request(server)
      .post('/purchases')
      .set('Authorization', authHeader)
      .send({
        purchaseDate: '2037-08-04T10:00:00.000Z',
        lines: [
          {
            description: 'Fermento',
            quantity: 1,
            unitPrice: 12.5,
            grossValue: 12.5,
            isCompanyExpense: true,
          },
        ],
      })
      .expect(HttpStatus.BAD_REQUEST);
  });

  it('GET /purchases pages the history and filters it', async () => {
    await postManualPurchase('2037-08-05T10:00:00.000Z', '20.00');
    await postManualPurchase('2037-08-06T10:00:00.000Z', '30.00');

    const firstPage = await request(server)
      .get('/purchases')
      .set('Authorization', authHeader)
      .query({ from: PERIOD.from, to: PERIOD.to, limit: 2, offset: 0 })
      .expect(HttpStatus.OK);

    const body = firstPage.body as PurchasePageView;

    expect(body.total).toBe(3);
    expect(body.items).toHaveLength(2);
    expect(body.limit).toBe(2);

    const filtered = await request(server)
      .get('/purchases')
      .set('Authorization', authHeader)
      .query({ establishmentId: '33.444.555/0001-66', from: PERIOD.from, to: PERIOD.to })
      .expect(HttpStatus.OK);

    expect((filtered.body as PurchasePageView).total).toBe(3);
  });

  it('GET /purchases rejects a page size past the ceiling', async () => {
    // Without a ceiling, one request could ask for every purchase ever
    // recorded and load every aggregate, lines included, into memory.
    await request(server)
      .get('/purchases')
      .set('Authorization', authHeader)
      .query({ limit: 5000 })
      .expect(HttpStatus.BAD_REQUEST);
  });

  it('GET /purchases/spending returns the dataset by dimension', async () => {
    const response = await request(server)
      .get('/purchases/spending')
      .set('Authorization', authHeader)
      .query({ from: PERIOD.from, to: PERIOD.to, granularity: 'MONTH' })
      .expect(HttpStatus.OK);

    const dataset = response.body as SpendingDatasetView;

    // One route, both dimensions, and no metric computed for the screen: the
    // period total, the average ticket and the ranking are all folds over
    // these arrays, done by the client.
    expect(dataset.byPeriod).toEqual([
      { period: '2037-08', netSpend: '62.50', discountTotal: '0.00', purchaseCount: 3 },
    ]);
    expect(dataset.byEstablishment).toEqual([
      {
        establishmentId: '33.444.555/0001-66',
        establishmentName: 'MERCADO DO ZE',
        netSpend: '62.50',
        discountTotal: '0.00',
        purchaseCount: 3,
      },
    ]);
  });

  it('GET /purchases/spending refuses a granularity that is not a dimension', async () => {
    await request(server)
      .get('/purchases/spending')
      .set('Authorization', authHeader)
      .query({ from: PERIOD.from, to: PERIOD.to, granularity: 'FORTNIGHT' })
      .expect(HttpStatus.BAD_REQUEST);
  });

  it('GET /purchases/:id answers with the detail, and 404 for one that does not exist', async () => {
    const created = await postManualPurchase('2037-08-07T10:00:00.000Z', '9.90');

    const response = await request(server)
      .get(`/purchases/${created.id}`)
      .set('Authorization', authHeader)
      .expect(HttpStatus.OK);

    const detail = response.body as PurchaseDetailView;

    expect(detail.items).toHaveLength(1);
    // A purchase typed in by hand has no captured note, and says so.
    expect(detail.rawInvoiceData).toBeNull();

    await request(server)
      .get('/purchases/0f4b2f8c-1d3e-4a5b-8c7d-9e0f1a2b3c4d')
      .set('Authorization', authHeader)
      .expect(HttpStatus.NOT_FOUND);
  });

  it('edits the lines over HTTP and closes the edit', async () => {
    const created = await postManualPurchase('2037-08-08T10:00:00.000Z', '40.00');

    const added = await request(server)
      .post(`/purchases/${created.id}/items`)
      .set('Authorization', authHeader)
      .send({
        description: 'Embalagem',
        quantity: 10,
        unitPrice: '0.80',
        grossValue: '8.00',
        isCompanyExpense: true,
      })
      .expect(HttpStatus.CREATED);

    expect((added.body as PurchaseDetailView).grossTotal).toBe('48.00');

    const removed = await request(server)
      .delete(`/purchases/${created.id}/items/${created.items[0].id}`)
      .set('Authorization', authHeader)
      .expect(HttpStatus.OK);

    expect((removed.body as PurchaseDetailView).grossTotal).toBe('8.00');

    await request(server)
      .post(`/purchases/${created.id}/complete-edit`)
      .set('Authorization', authHeader)
      .expect(HttpStatus.OK);
  });

  it('refuses to close an edit that left a manual attribution pending, with 422', async () => {
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

    const created = response.body as PurchaseView;
    createdPurchaseIds.push(created.id);

    await request(server)
      .patch(`/purchases/${created.id}/discount-allocation`)
      .set('Authorization', authHeader)
      .send({
        mode: 'MANUAL',
        manualAllocation: [
          { itemId: created.items[0].id, allocatedDiscount: '10.00' },
          { itemId: created.items[1].id, allocatedDiscount: '0.00' },
        ],
      })
      .expect(HttpStatus.OK);

    const pending = await request(server)
      .delete(`/purchases/${created.id}/items/${created.items[0].id}`)
      .set('Authorization', authHeader)
      .expect(HttpStatus.OK);

    expect((pending.body as PurchaseDetailView).allocationPending).toBe(true);

    await request(server)
      .post(`/purchases/${created.id}/complete-edit`)
      .set('Authorization', authHeader)
      .expect(HttpStatus.UNPROCESSABLE_ENTITY);

    await request(server)
      .patch(`/purchases/${created.id}/discount-allocation`)
      .set('Authorization', authHeader)
      .send({
        mode: 'MANUAL',
        manualAllocation: [{ itemId: created.items[1].id, allocatedDiscount: '10.00' }],
      })
      .expect(HttpStatus.OK);

    await request(server)
      .post(`/purchases/${created.id}/complete-edit`)
      .set('Authorization', authHeader)
      .expect(HttpStatus.OK);
  });
});
