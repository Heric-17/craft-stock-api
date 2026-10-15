import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';

import { HttpStatus, type INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import type { MaterialView } from '../src/modules/materials/application/dto/materials.dto';
import type {
  StockAdjustmentResultView,
  StockLossDatasetView,
  StockLossPageView,
} from '../src/modules/materials/application/dto/stock-adjustments.dto';
import { PrismaService } from '../src/shared/infrastructure/prisma/prisma.service';
import type { ErrorResponseBody } from '../src/shared/presentation/filters/all-exceptions.filter';
import { authenticate } from './support/authenticate';
import { configureTestApp } from './support/configure-test-app';

interface ValidationFieldError {
  path: string;
  constraints: string[];
}

/** Manual stock changes with a reason, over HTTP against a real database. */
describe('Stock adjustments (e2e)', () => {
  let app: INestApplication;
  let server: Server;
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
    prisma = moduleRef.get(PrismaService);
    ({ authHeader, userId: actorUserId } = await authenticate(moduleRef, server));
  });

  afterAll(async () => {
    // A reversal points at the entry it undoes, so the reversals go first.
    await prisma.stockAdjustment.deleteMany({
      where: { materialId: { in: createdMaterialIds }, kind: 'REVERSAL' },
    });
    await prisma.stockAdjustment.deleteMany({ where: { materialId: { in: createdMaterialIds } } });
    await prisma.materialPriceHistory.deleteMany({
      where: { materialId: { in: createdMaterialIds } },
    });
    await prisma.material.deleteMany({ where: { id: { in: createdMaterialIds } } });
    await prisma.user.deleteMany({ where: { id: actorUserId } });
    await app.close();
  });

  async function createMaterial(
    overrides: Record<string, unknown> = {},
  ): Promise<{ id: string; name: string }> {
    const name = `Vinho ${randomUUID()}`;
    const response = await request(server)
      .post('/materials')
      .set('Authorization', authHeader)
      .send({
        name,
        packageCost: '40.00',
        packageQuantity: 1,
        consumptionUnit: 'UNIT',
        stockQuantity: 2,
        minimumStockAlert: 1,
        ...overrides,
      })
      .expect(HttpStatus.CREATED);
    const id = (response.body as MaterialView).id;
    createdMaterialIds.push(id);

    return { id, name };
  }

  const postAdjustment = (materialId: string, body: Record<string, unknown>) =>
    request(server)
      .post(`/materials/${materialId}/stock-adjustments`)
      .set('Authorization', authHeader)
      .send(body);

  const postStockEntry = (materialId: string, body: Record<string, unknown>) =>
    request(server)
      .post(`/materials/${materialId}/stock-entries`)
      .set('Authorization', authHeader)
      .send(body);

  const getMaterial = async (id: string): Promise<MaterialView> =>
    (
      await request(server)
        .get(`/materials/${id}`)
        .set('Authorization', authHeader)
        .expect(HttpStatus.OK)
    ).body as MaterialView;

  describe('POST /materials/:id/stock-adjustments', () => {
    it('records a loss, takes it out of stock, and derives the value from the cost of the moment', async () => {
      const { id } = await createMaterial();

      const response = await postAdjustment(id, {
        kind: 'MANUAL_LOSS',
        quantity: 1,
        reason: 'BREAKAGE',
        observation: 'caiu da prateleira',
      }).expect(HttpStatus.CREATED);
      const body = response.body as StockAdjustmentResultView;

      expect(body).toMatchObject({
        kind: 'MANUAL_LOSS',
        materialId: id,
        quantityDelta: -1,
        reason: 'BREAKAGE',
        observation: 'caiu da prateleira',
        value: '40.00',
        costBasisAmount: '40.00',
        costBasisQuantity: 1,
        reversedAdjustmentId: null,
        stockQuantityAfter: 1,
      });
      expect((await getMaterial(id)).stockQuantity).toBe(1);
    });

    it('persists the fraction of the cost and nothing already divided', async () => {
      const { id } = await createMaterial({
        packageCost: '28.00',
        packageQuantity: 1000,
        consumptionUnit: 'GRAM',
        stockQuantity: 500,
      });

      const response = await postAdjustment(id, {
        kind: 'MANUAL_LOSS',
        quantity: 120,
        reason: 'SPOILAGE',
      }).expect(HttpStatus.CREATED);
      const body = response.body as StockAdjustmentResultView;
      const row = await prisma.stockAdjustment.findUniqueOrThrow({ where: { id: body.id } });

      expect(body.value).toBe('3.36');
      expect(row.costBasisAmount.toString()).toBe('28');
      expect(row.costBasisQuantity.toString()).toBe('1000');
      expect(row.quantityDelta.toString()).toBe('-120');
      expect(Object.keys(row)).not.toEqual(expect.arrayContaining(['value']));
    });

    it('refuses more than the balance, answers with the balance, and changes nothing', async () => {
      const { id } = await createMaterial({ stockQuantity: 1 });

      const response = await postAdjustment(id, {
        kind: 'MANUAL_LOSS',
        quantity: 5,
        reason: 'BREAKAGE',
      }).expect(HttpStatus.UNPROCESSABLE_ENTITY);
      const body = response.body as ErrorResponseBody;

      expect(body.code).toBe('INSUFFICIENT_STOCK');
      expect(body.details).toEqual({ materialId: id, stockQuantity: 1, requestedQuantity: 5 });
      expect((await getMaterial(id)).stockQuantity).toBe(1);
      expect(await prisma.stockAdjustment.count({ where: { materialId: id } })).toBe(0);
    });

    it('refuses a loss without a reason, naming the field', async () => {
      const { id } = await createMaterial();

      const response = await postAdjustment(id, { kind: 'MANUAL_LOSS', quantity: 1 }).expect(
        HttpStatus.BAD_REQUEST,
      );
      const details = (response.body as { details: ValidationFieldError[] }).details;

      expect(details.map((entry) => entry.path)).toEqual(['reason']);
    });

    it.each([
      ['a zero quantity', { kind: 'MANUAL_LOSS', quantity: 0, reason: 'LOST' }, 'quantity'],
      ['a negative quantity', { kind: 'MANUAL_LOSS', quantity: -1, reason: 'LOST' }, 'quantity'],
      [
        'four decimal places',
        { kind: 'MANUAL_LOSS', quantity: 0.0001, reason: 'LOST' },
        'quantity',
      ],
      ['a reason outside the list', { kind: 'MANUAL_LOSS', quantity: 1, reason: 'NOPE' }, 'reason'],
      ['a kind this route does not record', { kind: 'MANUAL_ENTRY', quantity: 1 }, 'kind'],
      ['a reversal with no target', { kind: 'REVERSAL' }, 'reversedAdjustmentId'],
    ])('refuses %s', async (_label, body, path) => {
      const { id } = await createMaterial();

      const response = await postAdjustment(id, body).expect(HttpStatus.BAD_REQUEST);
      const details = (response.body as { details: ValidationFieldError[] }).details;

      expect(details.map((entry) => entry.path)).toContain(path);
    });

    it('refuses the fields of the other shape', async () => {
      const { id } = await createMaterial();

      await postAdjustment(id, {
        kind: 'MANUAL_LOSS',
        quantity: 1,
        reason: 'LOST',
        reversedAdjustmentId: randomUUID(),
      }).expect(HttpStatus.BAD_REQUEST);
      await postAdjustment(id, {
        kind: 'REVERSAL',
        reversedAdjustmentId: randomUUID(),
        quantity: 1,
      }).expect(HttpStatus.BAD_REQUEST);
    });

    it('records a loss on a discontinued Material', async () => {
      const { id } = await createMaterial();
      await request(server)
        .post(`/materials/${id}/discontinue`)
        .set('Authorization', authHeader)
        .expect(HttpStatus.OK);

      const response = await postAdjustment(id, {
        kind: 'MANUAL_LOSS',
        quantity: 1,
        reason: 'EXPIRED',
      }).expect(HttpStatus.CREATED);

      expect((response.body as StockAdjustmentResultView).stockQuantityAfter).toBe(1);
    });

    it('answers 422 for a Material that does not exist', async () => {
      await postAdjustment(randomUUID(), {
        kind: 'MANUAL_LOSS',
        quantity: 1,
        reason: 'LOST',
      }).expect(HttpStatus.UNPROCESSABLE_ENTITY);
    });
  });

  describe('a reversal', () => {
    it('puts the stock back, and leaves both entries in the table', async () => {
      const { id } = await createMaterial();
      const loss = (
        await postAdjustment(id, {
          kind: 'MANUAL_LOSS',
          quantity: 1,
          reason: 'BREAKAGE',
        }).expect(HttpStatus.CREATED)
      ).body as StockAdjustmentResultView;

      const response = await postAdjustment(id, {
        kind: 'REVERSAL',
        reversedAdjustmentId: loss.id,
        observation: 'não quebrou',
      }).expect(HttpStatus.CREATED);
      const reversal = response.body as StockAdjustmentResultView;

      expect(reversal).toMatchObject({
        kind: 'REVERSAL',
        quantityDelta: 1,
        reversedAdjustmentId: loss.id,
        value: '40.00',
        stockQuantityAfter: 2,
      });
      expect((await getMaterial(id)).stockQuantity).toBe(2);
      expect(await prisma.stockAdjustment.count({ where: { materialId: id } })).toBe(2);
    });

    it('reverses at the cost the loss froze, whatever the Material costs now', async () => {
      const { id } = await createMaterial();
      const loss = (
        await postAdjustment(id, { kind: 'MANUAL_LOSS', quantity: 1, reason: 'BREAKAGE' }).expect(
          HttpStatus.CREATED,
        )
      ).body as StockAdjustmentResultView;
      await request(server)
        .patch(`/materials/${id}`)
        .set('Authorization', authHeader)
        .send({ packageCost: '90.00' })
        .expect(HttpStatus.OK);

      const reversal = (
        await postAdjustment(id, { kind: 'REVERSAL', reversedAdjustmentId: loss.id }).expect(
          HttpStatus.CREATED,
        )
      ).body as StockAdjustmentResultView;

      expect(reversal.value).toBe(loss.value);
      expect(reversal.costBasisAmount).toBe('40.00');
    });

    it('refuses to reverse the same entry twice', async () => {
      const { id } = await createMaterial();
      const loss = (
        await postAdjustment(id, { kind: 'MANUAL_LOSS', quantity: 1, reason: 'BREAKAGE' }).expect(
          HttpStatus.CREATED,
        )
      ).body as StockAdjustmentResultView;
      await postAdjustment(id, { kind: 'REVERSAL', reversedAdjustmentId: loss.id }).expect(
        HttpStatus.CREATED,
      );

      const response = await postAdjustment(id, {
        kind: 'REVERSAL',
        reversedAdjustmentId: loss.id,
      }).expect(HttpStatus.UNPROCESSABLE_ENTITY);

      expect((response.body as ErrorResponseBody).code).toBe('STOCK_ADJUSTMENT_ALREADY_REVERSED');
      expect((await getMaterial(id)).stockQuantity).toBe(2);
    });

    it('refuses an entry that does not exist, or that belongs to another Material', async () => {
      const first = await createMaterial();
      const second = await createMaterial();
      const loss = (
        await postAdjustment(first.id, {
          kind: 'MANUAL_LOSS',
          quantity: 1,
          reason: 'BREAKAGE',
        }).expect(HttpStatus.CREATED)
      ).body as StockAdjustmentResultView;

      const missing = await postAdjustment(first.id, {
        kind: 'REVERSAL',
        reversedAdjustmentId: randomUUID(),
      }).expect(HttpStatus.UNPROCESSABLE_ENTITY);
      const foreign = await postAdjustment(second.id, {
        kind: 'REVERSAL',
        reversedAdjustmentId: loss.id,
      }).expect(HttpStatus.UNPROCESSABLE_ENTITY);

      expect((missing.body as ErrorResponseBody).code).toBe('STOCK_ADJUSTMENT_NOT_FOUND');
      expect((foreign.body as ErrorResponseBody).code).toBe('INVALID_STOCK_ADJUSTMENT');
    });
  });

  describe('POST /materials/:id/stock-entries', () => {
    it('refuses a negative relativeIncrement, naming the field', async () => {
      const { id } = await createMaterial({ stockQuantity: 5 });

      const response = await postStockEntry(id, {
        source: 'MANUAL',
        relativeIncrement: -1,
      }).expect(HttpStatus.BAD_REQUEST);
      const details = (response.body as { details: ValidationFieldError[] }).details;

      expect(details.map((entry) => entry.path)).toEqual(['relativeIncrement']);
      expect((await getMaterial(id)).stockQuantity).toBe(5);
      expect(await prisma.stockAdjustment.count({ where: { materialId: id } })).toBe(0);
    });

    it('leaves a MANUAL_ENTRY for a typed-in increment', async () => {
      const { id } = await createMaterial({ stockQuantity: 5 });

      await postStockEntry(id, { source: 'MANUAL', relativeIncrement: 3 }).expect(HttpStatus.OK);

      const [row] = await prisma.stockAdjustment.findMany({ where: { materialId: id } });
      expect(row).toMatchObject({ kind: 'MANUAL_ENTRY', reason: null });
      expect(row.quantityDelta.toString()).toBe('3');
    });

    it('leaves a traceable MANUAL_ADJUSTMENT for a count that went down, in the same transaction', async () => {
      const { id } = await createMaterial({ stockQuantity: 10 });

      const response = await postStockEntry(id, {
        source: 'MANUAL',
        absoluteQuantity: 4,
      }).expect(HttpStatus.OK);

      expect((response.body as MaterialView).stockQuantity).toBe(4);
      const [row] = await prisma.stockAdjustment.findMany({ where: { materialId: id } });
      expect(row).toMatchObject({ kind: 'MANUAL_ADJUSTMENT', reason: null });
      expect(row.quantityDelta.toString()).toBe('-6');
      expect(row.costBasisAmount.toString()).toBe('40');
    });

    it('leaves a MANUAL_ADJUSTMENT for a count that went up, and none for a count that matches', async () => {
      const { id } = await createMaterial({ stockQuantity: 10 });

      await postStockEntry(id, { source: 'MANUAL', absoluteQuantity: 10 }).expect(HttpStatus.OK);
      expect(await prisma.stockAdjustment.count({ where: { materialId: id } })).toBe(0);

      await postStockEntry(id, { source: 'MANUAL', absoluteQuantity: 12 }).expect(HttpStatus.OK);
      const [row] = await prisma.stockAdjustment.findMany({ where: { materialId: id } });
      expect(row.quantityDelta.toString()).toBe('2');
    });

    it('applies a count to a discontinued Material', async () => {
      const { id } = await createMaterial({ stockQuantity: 10 });
      await request(server)
        .post(`/materials/${id}/discontinue`)
        .set('Authorization', authHeader)
        .expect(HttpStatus.OK);

      const response = await postStockEntry(id, {
        source: 'MANUAL',
        absoluteQuantity: 7,
      }).expect(HttpStatus.OK);

      expect((response.body as MaterialView).stockQuantity).toBe(7);
      expect(await prisma.stockAdjustment.count({ where: { materialId: id } })).toBe(1);
    });
  });

  describe('the value is the frozen cost, not the current one', () => {
    it('does not move when the packageCost of the Material changes after the loss', async () => {
      const { id } = await createMaterial();
      await postAdjustment(id, { kind: 'MANUAL_LOSS', quantity: 1, reason: 'BREAKAGE' }).expect(
        HttpStatus.CREATED,
      );

      const before = (
        await request(server)
          .get('/materials/losses')
          .set('Authorization', authHeader)
          .query({ materialId: id })
          .expect(HttpStatus.OK)
      ).body as StockLossPageView;

      await request(server)
        .patch(`/materials/${id}`)
        .set('Authorization', authHeader)
        .send({ packageCost: '55.00' })
        .expect(HttpStatus.OK);

      const after = (
        await request(server)
          .get('/materials/losses')
          .set('Authorization', authHeader)
          .query({ materialId: id })
          .expect(HttpStatus.OK)
      ).body as StockLossPageView;

      expect(before.items[0].value).toBe('40.00');
      expect(after.items[0].value).toBe('40.00');
      expect(after.items[0].costBasisAmount).toBe('40.00');
      // And a loss recorded after the change is valued at the new cost.
      const later = (
        await postAdjustment(id, { kind: 'MANUAL_LOSS', quantity: 1, reason: 'LOST' }).expect(
          HttpStatus.CREATED,
        )
      ).body as StockAdjustmentResultView;
      expect(later.value).toBe('55.00');
    });
  });

  describe('GET /materials/losses', () => {
    const SAME_INSTANT = new Date('2099-01-01T12:00:00.000Z');

    async function seedLoss(
      materialId: string,
      overrides: { reason?: 'BREAKAGE' | 'EXPIRED'; createdAt?: Date } = {},
    ): Promise<string> {
      const row = await prisma.stockAdjustment.create({
        data: {
          id: randomUUID(),
          materialId,
          kind: 'MANUAL_LOSS',
          quantityDelta: -1,
          reason: overrides.reason ?? 'BREAKAGE',
          costBasisAmount: '40.00',
          costBasisQuantity: 1,
          createdAt: overrides.createdAt ?? SAME_INSTANT,
        },
      });

      return row.id;
    }

    async function getPage(query: Record<string, string | number>): Promise<StockLossPageView> {
      const response = await request(server)
        .get('/materials/losses')
        .set('Authorization', authHeader)
        .query(query)
        .expect(HttpStatus.OK);

      return response.body as StockLossPageView;
    }

    /** Every page in turn, until the offset passes the total. */
    async function walk(limit: number, filter: Record<string, string>) {
      const pages: StockLossPageView[] = [];
      let offset = 0;

      for (;;) {
        const page = await getPage({ ...filter, limit, offset });
        pages.push(page);
        offset += limit;
        if (offset >= page.total) {
          break;
        }
      }

      return { pages, items: pages.flatMap((page) => page.items) };
    }

    it('is not shadowed by the :id route', async () => {
      const page = await getPage({});

      expect(Object.keys(page).sort()).toEqual(['items', 'limit', 'offset', 'total']);
      expect(page.limit).toBe(20);
    });

    it('walks the history without repeating or skipping a loss, ties included', async () => {
      const { id } = await createMaterial({ stockQuantity: 50 });
      const seeded: string[] = [];
      for (let index = 0; index < 5; index++) {
        seeded.push(await seedLoss(id));
      }
      const expected = [...seeded].sort().reverse();

      const { pages, items } = await walk(2, { materialId: id });

      expect(items.map((item) => item.id)).toEqual(expected);
      expect(pages.every((page) => page.total === 5)).toBe(true);
      expect(new Set(items.map((item) => item.id)).size).toBe(5);
    });

    it('gives the same order whatever the page size', async () => {
      const { id } = await createMaterial({ stockQuantity: 50 });
      for (let index = 0; index < 5; index++) {
        await seedLoss(id);
      }

      const small = (await walk(2, { materialId: id })).items.map((item) => item.id);
      const large = (await walk(5, { materialId: id })).items.map((item) => item.id);

      expect(large).toEqual(small);
    });

    it('answers an offset past the total with an empty page and the true total', async () => {
      const { id } = await createMaterial({ stockQuantity: 50 });
      await seedLoss(id);

      const page = await getPage({ materialId: id, limit: 10, offset: 50 });

      expect(page).toMatchObject({ items: [], total: 1, offset: 50 });
    });

    it('filters inside the query: the total counts the filtered set', async () => {
      const { id } = await createMaterial({ stockQuantity: 50 });
      await seedLoss(id, { reason: 'BREAKAGE' });
      await seedLoss(id, { reason: 'BREAKAGE' });
      await seedLoss(id, { reason: 'EXPIRED' });

      const expired = await getPage({ materialId: id, reason: 'EXPIRED', limit: 1 });
      const inWindow = await getPage({
        materialId: id,
        from: '2099-01-01T00:00:00.000Z',
        to: '2099-01-02T00:00:00.000Z',
      });
      const outOfWindow = await getPage({
        materialId: id,
        from: '2099-02-01T00:00:00.000Z',
        to: '2099-03-01T00:00:00.000Z',
      });

      expect(expired.total).toBe(1);
      expect(expired.items[0].reason).toBe('EXPIRED');
      expect(inWindow.total).toBe(3);
      expect(outOfWindow).toMatchObject({ items: [], total: 0 });
    });

    it('lists losses only, with the material name, and shows which were reversed', async () => {
      const { id, name } = await createMaterial({ stockQuantity: 50 });
      const loss = (
        await postAdjustment(id, { kind: 'MANUAL_LOSS', quantity: 2, reason: 'SPOILAGE' }).expect(
          HttpStatus.CREATED,
        )
      ).body as StockAdjustmentResultView;
      const reversal = (
        await postAdjustment(id, { kind: 'REVERSAL', reversedAdjustmentId: loss.id }).expect(
          HttpStatus.CREATED,
        )
      ).body as StockAdjustmentResultView;
      await postStockEntry(id, { source: 'MANUAL', relativeIncrement: 3 }).expect(HttpStatus.OK);

      const page = await getPage({ materialId: id });

      expect(page.total).toBe(1);
      expect(page.items[0]).toMatchObject({
        id: loss.id,
        materialName: name,
        quantityDelta: -2,
        value: '80.00',
        reversedByAdjustmentId: reversal.id,
      });
    });

    it('refuses a limit above the ceiling, a limit of zero and a negative offset', async () => {
      for (const query of [{ limit: 101 }, { limit: 0 }, { offset: -1 }]) {
        await request(server)
          .get('/materials/losses')
          .set('Authorization', authHeader)
          .query(query)
          .expect(HttpStatus.BAD_REQUEST);
      }
    });

    it('refuses a reason outside the list', async () => {
      await request(server)
        .get('/materials/losses')
        .set('Authorization', authHeader)
        .query({ reason: 'NOPE' })
        .expect(HttpStatus.BAD_REQUEST);
    });
  });

  describe('GET /materials/losses/dataset', () => {
    const MARCH = {
      from: '2098-03-01T03:00:00.000Z',
      to: '2098-04-01T03:00:00.000Z',
    };

    async function seedLoss(input: {
      materialId: string;
      quantity: number;
      reason: 'BREAKAGE' | 'EXPIRED' | 'SPOILAGE';
      createdAt: string;
      costBasisAmount?: string;
      costBasisQuantity?: number;
    }): Promise<string> {
      const row = await prisma.stockAdjustment.create({
        data: {
          id: randomUUID(),
          materialId: input.materialId,
          kind: 'MANUAL_LOSS',
          quantityDelta: -input.quantity,
          reason: input.reason,
          costBasisAmount: input.costBasisAmount ?? '40.00',
          costBasisQuantity: input.costBasisQuantity ?? 1,
          createdAt: new Date(input.createdAt),
        },
      });

      return row.id;
    }

    const getDataset = async (query: Record<string, string>): Promise<StockLossDatasetView> =>
      (
        await request(server)
          .get('/materials/losses/dataset')
          .set('Authorization', authHeader)
          .query(query)
          .expect(HttpStatus.OK)
      ).body as StockLossDatasetView;

    it('separates one month with two reasons and two materials, and the cuts agree', async () => {
      const wine = await createMaterial({ stockQuantity: 50 });
      const flour = await createMaterial({
        packageCost: '28.00',
        packageQuantity: 1000,
        consumptionUnit: 'GRAM',
        stockQuantity: 5000,
      });
      await seedLoss({
        materialId: wine.id,
        quantity: 1,
        reason: 'BREAKAGE',
        createdAt: '2098-03-05T15:00:00.000Z',
      });
      await seedLoss({
        materialId: wine.id,
        quantity: 2,
        reason: 'EXPIRED',
        createdAt: '2098-03-12T15:00:00.000Z',
      });
      await seedLoss({
        materialId: flour.id,
        quantity: 120,
        reason: 'BREAKAGE',
        createdAt: '2098-03-20T15:00:00.000Z',
        costBasisAmount: '28.00',
        costBasisQuantity: 1000,
      });

      const dataset = await getDataset(MARCH);
      const mine = dataset.byMaterial.filter((cell) =>
        [wine.id, flour.id].includes(cell.materialId),
      );

      expect(dataset.byMonth).toEqual([{ month: '2098-03', lossCount: 3, lossValue: '123.36' }]);
      expect(dataset.byReason.find((c) => c.reason === 'BREAKAGE')).toEqual({
        reason: 'BREAKAGE',
        lossCount: 2,
        lossValue: '43.36',
      });
      expect(dataset.byReason.find((c) => c.reason === 'EXPIRED')).toEqual({
        reason: 'EXPIRED',
        lossCount: 1,
        lossValue: '80.00',
      });
      expect(dataset.byReason.find((c) => c.reason === 'OTHER')?.lossCount).toBe(0);
      expect(mine).toEqual([
        { materialId: wine.id, materialName: wine.name, lossCount: 2, lossValue: '120.00' },
        { materialId: flour.id, materialName: flour.name, lossCount: 1, lossValue: '3.36' },
      ]);
    });

    it('leaves a reversed loss out, in the month it was recorded', async () => {
      const wine = await createMaterial({ stockQuantity: 50 });
      const kept = await seedLoss({
        materialId: wine.id,
        quantity: 1,
        reason: 'BREAKAGE',
        createdAt: '2097-03-05T15:00:00.000Z',
      });
      const undone = await seedLoss({
        materialId: wine.id,
        quantity: 4,
        reason: 'SPOILAGE',
        createdAt: '2097-03-06T15:00:00.000Z',
      });
      await prisma.stockAdjustment.create({
        data: {
          id: randomUUID(),
          materialId: wine.id,
          kind: 'REVERSAL',
          quantityDelta: 4,
          costBasisAmount: '40.00',
          costBasisQuantity: 1,
          reversedAdjustmentId: undone,
          createdAt: new Date('2097-04-10T15:00:00.000Z'),
        },
      });

      const dataset = await getDataset({
        from: '2097-03-01T03:00:00.000Z',
        to: '2097-05-01T03:00:00.000Z',
      });

      expect(kept).toBeDefined();
      expect(dataset.byMonth).toEqual([
        { month: '2097-03', lossCount: 1, lossValue: '40.00' },
        { month: '2097-04', lossCount: 0, lossValue: '0.00' },
      ]);
    });

    it('uses the calendar of Sao Paulo: 21:30 on 31 March is still March', async () => {
      const wine = await createMaterial({ stockQuantity: 50 });
      await seedLoss({
        materialId: wine.id,
        quantity: 1,
        reason: 'BREAKAGE',
        createdAt: '2096-04-01T00:30:00.000Z',
      });

      const dataset = await getDataset({
        from: '2096-03-01T03:00:00.000Z',
        to: '2096-05-01T03:00:00.000Z',
      });

      expect(dataset.byMonth).toEqual([
        { month: '2096-03', lossCount: 1, lossValue: '40.00' },
        { month: '2096-04', lossCount: 0, lossValue: '0.00' },
      ]);
    });

    it('is zeros, and still lists the month, for a period with no loss', async () => {
      const dataset = await getDataset({
        from: '2095-03-01T03:00:00.000Z',
        to: '2095-04-01T03:00:00.000Z',
      });

      expect(dataset.byMonth).toEqual([{ month: '2095-03', lossCount: 0, lossValue: '0.00' }]);
      expect(dataset.byReason).toHaveLength(5);
      expect(dataset.byReason.every((cell) => cell.lossValue === '0.00')).toBe(true);
      expect(dataset.byMaterial).toEqual([]);
    });

    it('does not move when the Material costs more later', async () => {
      const wine = await createMaterial({ stockQuantity: 50 });
      await seedLoss({
        materialId: wine.id,
        quantity: 1,
        reason: 'BREAKAGE',
        createdAt: '2094-03-05T15:00:00.000Z',
      });
      const query = { from: '2094-03-01T03:00:00.000Z', to: '2094-04-01T03:00:00.000Z' };

      const before = await getDataset(query);
      await request(server)
        .patch(`/materials/${wine.id}`)
        .set('Authorization', authHeader)
        .send({ packageCost: '99.00' })
        .expect(HttpStatus.OK);
      const after = await getDataset(query);

      expect(before.byMonth[0].lossValue).toBe('40.00');
      expect(after.byMonth[0].lossValue).toBe('40.00');
    });

    it('refuses a request without the whole period', async () => {
      await request(server)
        .get('/materials/losses/dataset')
        .set('Authorization', authHeader)
        .query({ from: MARCH.from })
        .expect(HttpStatus.BAD_REQUEST);
    });
  });

  describe('ENTITY_IN_USE', () => {
    it('counts the adjustments, and refuses to delete a Material that has any', async () => {
      const { id } = await createMaterial({ stockQuantity: 10 });
      await postAdjustment(id, { kind: 'MANUAL_LOSS', quantity: 1, reason: 'BREAKAGE' }).expect(
        HttpStatus.CREATED,
      );
      await postStockEntry(id, { source: 'MANUAL', absoluteQuantity: 5 }).expect(HttpStatus.OK);

      const response = await request(server)
        .delete(`/materials/${id}`)
        .set('Authorization', authHeader)
        .expect(HttpStatus.UNPROCESSABLE_ENTITY);
      const body = response.body as ErrorResponseBody;

      expect(body.code).toBe('ENTITY_IN_USE');
      expect(body.details).toEqual({
        entityName: 'Material',
        entityId: id,
        saleItems: 0,
        bomItems: 0,
        purchaseItems: 0,
        stockMovements: 0,
        stockAdjustments: 2,
        total: 2,
      });
    });

    it('still deletes a Material that has none', async () => {
      const { id } = await createMaterial();

      await request(server)
        .delete(`/materials/${id}`)
        .set('Authorization', authHeader)
        .expect(HttpStatus.NO_CONTENT);
    });
  });

  describe('the id of the entry, for undoing it right away', () => {
    it('stock-entries returns the id of the entry it recorded, and that id can be reversed', async () => {
      const { id } = await createMaterial({ stockQuantity: 5 });

      const entry = (
        await postStockEntry(id, { source: 'MANUAL', relativeIncrement: 3 }).expect(HttpStatus.OK)
      ).body as MaterialView & { stockAdjustmentId: string | null };

      expect(entry.stockQuantity).toBe(8);
      expect(entry.stockAdjustmentId).toEqual(expect.any(String));

      const reversal = (
        await postAdjustment(id, {
          kind: 'REVERSAL',
          reversedAdjustmentId: entry.stockAdjustmentId,
        }).expect(HttpStatus.CREATED)
      ).body as StockAdjustmentResultView;

      expect(reversal).toMatchObject({ quantityDelta: -3, stockQuantityAfter: 5 });
    });

    it('returns the id of a count correction too, and reverses it', async () => {
      const { id } = await createMaterial({ stockQuantity: 10 });

      const count = (
        await postStockEntry(id, { source: 'MANUAL', absoluteQuantity: 4 }).expect(HttpStatus.OK)
      ).body as MaterialView & { stockAdjustmentId: string | null };
      expect(count.stockAdjustmentId).toEqual(expect.any(String));

      const reversal = (
        await postAdjustment(id, {
          kind: 'REVERSAL',
          reversedAdjustmentId: count.stockAdjustmentId,
        }).expect(HttpStatus.CREATED)
      ).body as StockAdjustmentResultView;

      expect(reversal.stockQuantityAfter).toBe(10);
    });

    it('returns null when nothing was recorded: a count equal to the balance, or an invoice sync', async () => {
      const { id } = await createMaterial({ stockQuantity: 10 });

      const same = (
        await postStockEntry(id, { source: 'MANUAL', absoluteQuantity: 10 }).expect(HttpStatus.OK)
      ).body as { stockAdjustmentId: string | null };
      const sync = (
        await postStockEntry(id, { source: 'INVOICE_SYNC', relativeIncrement: 2 }).expect(
          HttpStatus.OK,
        )
      ).body as { stockAdjustmentId: string | null };

      expect(same.stockAdjustmentId).toBeNull();
      expect(sync.stockAdjustmentId).toBeNull();
    });
  });

  describe('GET /materials/:id/stock-adjustments', () => {
    type HistoryPage = {
      items: (StockAdjustmentResultView & { reversedByAdjustmentId: string | null })[];
      total: number;
      limit: number;
      offset: number;
    };

    const getHistory = async (
      id: string,
      query: Record<string, string | number> = {},
    ): Promise<HistoryPage> =>
      (
        await request(server)
          .get(`/materials/${id}/stock-adjustments`)
          .set('Authorization', authHeader)
          .query(query)
          .expect(HttpStatus.OK)
      ).body as HistoryPage;

    it('shows every kind, reversals included, newest first', async () => {
      const { id } = await createMaterial({ stockQuantity: 10 });
      const entry = (
        await postStockEntry(id, { source: 'MANUAL', relativeIncrement: 2 }).expect(HttpStatus.OK)
      ).body as { stockAdjustmentId: string };
      await postStockEntry(id, { source: 'MANUAL', absoluteQuantity: 8 }).expect(HttpStatus.OK);
      const loss = (
        await postAdjustment(id, { kind: 'MANUAL_LOSS', quantity: 1, reason: 'BREAKAGE' }).expect(
          HttpStatus.CREATED,
        )
      ).body as StockAdjustmentResultView;
      const reversal = (
        await postAdjustment(id, { kind: 'REVERSAL', reversedAdjustmentId: loss.id }).expect(
          HttpStatus.CREATED,
        )
      ).body as StockAdjustmentResultView;

      const history = await getHistory(id);

      expect(history.total).toBe(4);
      expect(history.items.map((item) => item.kind)).toEqual([
        'REVERSAL',
        'MANUAL_LOSS',
        'MANUAL_ADJUSTMENT',
        'MANUAL_ENTRY',
      ]);
      expect(history.items[0]).toMatchObject({ id: reversal.id, reversedAdjustmentId: loss.id });
      expect(history.items[1]).toMatchObject({ id: loss.id, reversedByAdjustmentId: reversal.id });
      expect(history.items[3]).toMatchObject({
        id: entry.stockAdjustmentId,
        reversedByAdjustmentId: null,
      });
      expect(history.items[1].value).toBe('40.00');
    });

    it('narrows to one kind, and the total follows', async () => {
      const { id } = await createMaterial({ stockQuantity: 10 });
      await postStockEntry(id, { source: 'MANUAL', relativeIncrement: 2 }).expect(HttpStatus.OK);
      await postAdjustment(id, { kind: 'MANUAL_LOSS', quantity: 1, reason: 'LOST' }).expect(
        HttpStatus.CREATED,
      );

      const entries = await getHistory(id, { kind: 'MANUAL_ENTRY' });

      expect(entries.total).toBe(1);
      expect(entries.items.map((item) => item.kind)).toEqual(['MANUAL_ENTRY']);
    });

    it('only shows the entries of that Material', async () => {
      const first = await createMaterial({ stockQuantity: 10 });
      const second = await createMaterial({ stockQuantity: 10 });
      await postAdjustment(first.id, { kind: 'MANUAL_LOSS', quantity: 1, reason: 'LOST' }).expect(
        HttpStatus.CREATED,
      );

      expect((await getHistory(first.id)).total).toBe(1);
      expect((await getHistory(second.id)).total).toBe(0);
    });

    it('walks the history without repeating or skipping an entry, ties included', async () => {
      const { id } = await createMaterial({ stockQuantity: 50 });
      const seeded: string[] = [];
      for (let index = 0; index < 5; index++) {
        const row = await prisma.stockAdjustment.create({
          data: {
            id: randomUUID(),
            materialId: id,
            kind: 'MANUAL_ENTRY',
            quantityDelta: 1,
            costBasisAmount: '40.00',
            costBasisQuantity: 1,
            createdAt: new Date('2099-01-01T12:00:00.000Z'),
          },
        });
        seeded.push(row.id);
      }

      const walked: string[] = [];
      for (let offset = 0; offset < 5; offset += 2) {
        const page = await getHistory(id, { limit: 2, offset });
        expect(page.total).toBe(5);
        walked.push(...page.items.map((item) => item.id));
      }

      expect(walked).toEqual([...seeded].sort().reverse());
    });

    it('answers an offset past the total with an empty page', async () => {
      const { id } = await createMaterial();

      const page = await getHistory(id, { offset: 50 });

      expect(page).toMatchObject({ items: [], total: 0, limit: 20, offset: 50 });
    });

    it('answers 422 for a Material that does not exist, and 400 for a bad window or kind', async () => {
      const { id } = await createMaterial();

      await request(server)
        .get(`/materials/${randomUUID()}/stock-adjustments`)
        .set('Authorization', authHeader)
        .expect(HttpStatus.UNPROCESSABLE_ENTITY);

      for (const query of [{ limit: 101 }, { limit: 0 }, { offset: -1 }, { kind: 'NOPE' }]) {
        await request(server)
          .get(`/materials/${id}/stock-adjustments`)
          .set('Authorization', authHeader)
          .query(query)
          .expect(HttpStatus.BAD_REQUEST);
      }
    });
  });

  describe('the activity feed', () => {
    it('shows a loss, with the reason in the changes', async () => {
      const { id } = await createMaterial();
      const loss = (
        await postAdjustment(id, { kind: 'MANUAL_LOSS', quantity: 1, reason: 'EXPIRED' }).expect(
          HttpStatus.CREATED,
        )
      ).body as StockAdjustmentResultView;

      const response = await request(server)
        .get('/audit-log/activity')
        .set('Authorization', authHeader)
        .query({ limit: 100 })
        .expect(HttpStatus.OK);
      const items = (
        response.body as {
          items: {
            entityType: string;
            entityId: string;
            operation: string;
            changes: Record<string, { new: unknown }>;
          }[];
        }
      ).items;
      const entry = items.find((item) => item.entityId === loss.id);

      expect(entry).toMatchObject({ entityType: 'StockAdjustment', operation: 'CREATE' });
      expect(entry?.changes.reason.new).toBe('EXPIRED');
      expect(entry?.changes.materialId.new).toBe(id);
    });
  });
});
