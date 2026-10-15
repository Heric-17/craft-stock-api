import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';

import { HttpStatus, type INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import type { MaterialView } from '../src/modules/materials/application/dto/materials.dto';
import type {
  StockLossDatasetView,
  StockLossPageView,
  StockLossResultView,
} from '../src/modules/materials/application/dto/stock-losses.dto';
import { PrismaService } from '../src/shared/infrastructure/prisma/prisma.service';
import type { ErrorResponseBody } from '../src/shared/presentation/filters/all-exceptions.filter';
import { authenticate } from './support/authenticate';
import { configureTestApp } from './support/configure-test-app';

interface ValidationFieldError {
  path: string;
  constraints: string[];
}

/** Stock losses over HTTP against a real database. */
describe('Stock losses (e2e)', () => {
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
    await prisma.stockLoss.deleteMany({ where: { materialId: { in: createdMaterialIds } } });
    await prisma.materialPriceHistory.deleteMany({
      where: { materialId: { in: createdMaterialIds } },
    });
    await prisma.material.deleteMany({ where: { id: { in: createdMaterialIds } } });
    await prisma.user.deleteMany({ where: { id: actorUserId } });
    await app.close();
  });

  /** 10 biscuits at R$ 1,00 each, unless said otherwise. */
  async function createMaterial(
    overrides: Record<string, unknown> = {},
  ): Promise<{ id: string; name: string }> {
    const name = `Bolacha ${randomUUID()}`;
    const response = await request(server)
      .post('/materials')
      .set('Authorization', authHeader)
      .send({
        name,
        packageCost: '1.00',
        packageQuantity: 1,
        consumptionUnit: 'UNIT',
        stockQuantity: 10,
        minimumStockAlert: 2,
        ...overrides,
      })
      .expect(HttpStatus.CREATED);
    const id = (response.body as MaterialView).id;
    createdMaterialIds.push(id);

    return { id, name };
  }

  const postLoss = (materialId: string, body: Record<string, unknown>) =>
    request(server)
      .post(`/materials/${materialId}/losses`)
      .set('Authorization', authHeader)
      .send(body);

  const getMaterial = async (id: string): Promise<MaterialView> =>
    (
      await request(server)
        .get(`/materials/${id}`)
        .set('Authorization', authHeader)
        .expect(HttpStatus.OK)
    ).body as MaterialView;

  describe('POST /materials/:id/losses', () => {
    // 10 biscuits at R$ 1,00; 5 broke: 5 left and R$ 5,00 lost.
    it('takes the lost quantity out of stock and keeps the value lost', async () => {
      const { id, name } = await createMaterial();

      const response = await postLoss(id, {
        quantity: 5,
        reason: 'BREAKAGE',
        observation: 'caiu da caixa',
      }).expect(HttpStatus.CREATED);

      expect(response.body as StockLossResultView).toMatchObject({
        materialId: id,
        materialName: name,
        quantity: 5,
        reason: 'BREAKAGE',
        observation: 'caiu da caixa',
        value: '5.00',
        costBasisAmount: '1.00',
        costBasisQuantity: 1,
        stockQuantityAfter: 5,
      });
      expect((await getMaterial(id)).stockQuantity).toBe(5);
    });

    it('persists the fraction of the cost and nothing already divided', async () => {
      const { id } = await createMaterial({
        packageCost: '28.00',
        packageQuantity: 1000,
        consumptionUnit: 'GRAM',
        stockQuantity: 500,
      });

      const response = await postLoss(id, { quantity: 120, reason: 'SPOILAGE' }).expect(
        HttpStatus.CREATED,
      );
      const body = response.body as StockLossResultView;
      const row = await prisma.stockLoss.findUniqueOrThrow({ where: { id: body.id } });

      expect(body.value).toBe('3.36');
      expect(row.costBasisAmount.toString()).toBe('28');
      expect(row.costBasisQuantity.toString()).toBe('1000');
      expect(row.quantity.toString()).toBe('120');
      expect(Object.keys(row)).not.toEqual(expect.arrayContaining(['value']));
    });

    it('keeps the value of a loss when the cost of the Material changes later', async () => {
      const { id } = await createMaterial();
      await postLoss(id, { quantity: 5, reason: 'BREAKAGE' }).expect(HttpStatus.CREATED);
      await request(server)
        .patch(`/materials/${id}`)
        .set('Authorization', authHeader)
        .send({ packageCost: '2.00' })
        .expect(HttpStatus.OK);

      const page = (
        await request(server)
          .get('/materials/losses')
          .set('Authorization', authHeader)
          .query({ materialId: id })
          .expect(HttpStatus.OK)
      ).body as StockLossPageView;
      const later = (await postLoss(id, { quantity: 1, reason: 'LOST' }).expect(HttpStatus.CREATED))
        .body as StockLossResultView;

      expect(page.items[0].value).toBe('5.00');
      expect(later.value).toBe('2.00');
    });

    it('refuses more than the balance, answers with the balance, and changes nothing', async () => {
      const { id } = await createMaterial({ stockQuantity: 3 });

      const response = await postLoss(id, { quantity: 5, reason: 'BREAKAGE' }).expect(
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
      const body = response.body as ErrorResponseBody;

      expect(body.code).toBe('INSUFFICIENT_STOCK');
      expect(body.details).toEqual({ materialId: id, stockQuantity: 3, requestedQuantity: 5 });
      expect((await getMaterial(id)).stockQuantity).toBe(3);
      expect(await prisma.stockLoss.count({ where: { materialId: id } })).toBe(0);
    });

    it('requires a reason, naming the field', async () => {
      const { id } = await createMaterial();

      const response = await postLoss(id, { quantity: 1 }).expect(HttpStatus.BAD_REQUEST);
      const details = (response.body as { details: ValidationFieldError[] }).details;

      expect(details.map((entry) => entry.path)).toEqual(['reason']);
    });

    it.each([
      ['a zero quantity', { quantity: 0, reason: 'LOST' }, 'quantity'],
      ['a negative quantity', { quantity: -1, reason: 'LOST' }, 'quantity'],
      ['four decimal places', { quantity: 0.0001, reason: 'LOST' }, 'quantity'],
      ['a reason outside the list', { quantity: 1, reason: 'NOPE' }, 'reason'],
      [
        'an observation above 500 characters',
        { quantity: 1, reason: 'LOST', observation: 'x'.repeat(501) },
        'observation',
      ],
    ])('refuses %s', async (_label, body, path) => {
      const { id } = await createMaterial();

      const response = await postLoss(id, body).expect(HttpStatus.BAD_REQUEST);
      const details = (response.body as { details: ValidationFieldError[] }).details;

      expect(details.map((entry) => entry.path)).toContain(path);
    });

    it('records a loss on a discontinued Material', async () => {
      const { id } = await createMaterial();
      await request(server)
        .post(`/materials/${id}/discontinue`)
        .set('Authorization', authHeader)
        .expect(HttpStatus.OK);

      const response = await postLoss(id, { quantity: 1, reason: 'EXPIRED' }).expect(
        HttpStatus.CREATED,
      );

      expect((response.body as StockLossResultView).stockQuantityAfter).toBe(9);
    });

    it('answers 422 for a Material that does not exist', async () => {
      await postLoss(randomUUID(), { quantity: 1, reason: 'LOST' }).expect(
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    });
  });

  describe('stock entries no longer take stock out', () => {
    it('refuses a negative relativeIncrement, naming the field', async () => {
      const { id } = await createMaterial();

      const response = await request(server)
        .post(`/materials/${id}/stock-entries`)
        .set('Authorization', authHeader)
        .send({ source: 'MANUAL', relativeIncrement: -1 })
        .expect(HttpStatus.BAD_REQUEST);
      const details = (response.body as { details: ValidationFieldError[] }).details;

      expect(details.map((entry) => entry.path)).toEqual(['relativeIncrement']);
      expect((await getMaterial(id)).stockQuantity).toBe(10);
    });

    it('answers with the Material', async () => {
      const { id } = await createMaterial();

      const response = await request(server)
        .post(`/materials/${id}/stock-entries`)
        .set('Authorization', authHeader)
        .send({ source: 'MANUAL', relativeIncrement: 2 })
        .expect(HttpStatus.OK);

      expect((response.body as MaterialView).stockQuantity).toBe(12);
    });
  });

  describe('GET /materials/losses', () => {
    const SAME_INSTANT = new Date('2099-01-01T12:00:00.000Z');

    async function seedLoss(
      materialId: string,
      overrides: { reason?: 'BREAKAGE' | 'EXPIRED'; createdAt?: Date } = {},
    ): Promise<string> {
      const row = await prisma.stockLoss.create({
        data: {
          id: randomUUID(),
          materialId,
          quantity: 1,
          reason: overrides.reason ?? 'BREAKAGE',
          costBasisAmount: '1.00',
          costBasisQuantity: 1,
          createdAt: overrides.createdAt ?? SAME_INSTANT,
        },
      });

      return row.id;
    }

    async function getPage(query: Record<string, string | number>): Promise<StockLossPageView> {
      return (
        await request(server)
          .get('/materials/losses')
          .set('Authorization', authHeader)
          .query(query)
          .expect(HttpStatus.OK)
      ).body as StockLossPageView;
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

      const walked: string[] = [];
      for (let offset = 0; offset < 5; offset += 2) {
        const page = await getPage({ materialId: id, limit: 2, offset });
        expect(page.total).toBe(5);
        walked.push(...page.items.map((item) => item.id));
      }

      expect(walked).toEqual([...seeded].sort().reverse());
    });

    it('answers an offset past the total with an empty page and the true total', async () => {
      const { id } = await createMaterial();
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
      expect(inWindow.total).toBe(3);
      expect(outOfWindow).toMatchObject({ items: [], total: 0 });
    });

    it('refuses a limit above the ceiling, a limit of zero, a negative offset and an unknown reason', async () => {
      for (const query of [{ limit: 101 }, { limit: 0 }, { offset: -1 }, { reason: 'NOPE' }]) {
        await request(server)
          .get('/materials/losses')
          .set('Authorization', authHeader)
          .query(query)
          .expect(HttpStatus.BAD_REQUEST);
      }
    });
  });

  describe('GET /materials/losses/dataset', () => {
    const getDataset = async (query: Record<string, string>): Promise<StockLossDatasetView> =>
      (
        await request(server)
          .get('/materials/losses/dataset')
          .set('Authorization', authHeader)
          .query(query)
          .expect(HttpStatus.OK)
      ).body as StockLossDatasetView;

    async function seedLoss(input: {
      materialId: string;
      quantity: number;
      reason: 'BREAKAGE' | 'EXPIRED' | 'SPOILAGE';
      createdAt: string;
      costBasisAmount?: string;
      costBasisQuantity?: number;
    }): Promise<void> {
      await prisma.stockLoss.create({
        data: {
          id: randomUUID(),
          materialId: input.materialId,
          quantity: input.quantity,
          reason: input.reason,
          costBasisAmount: input.costBasisAmount ?? '1.00',
          costBasisQuantity: input.costBasisQuantity ?? 1,
          createdAt: new Date(input.createdAt),
        },
      });
    }

    it('separates one month with two reasons and two materials, and the cuts agree', async () => {
      const biscuit = await createMaterial({ stockQuantity: 50 });
      const flour = await createMaterial({
        packageCost: '28.00',
        packageQuantity: 1000,
        consumptionUnit: 'GRAM',
        stockQuantity: 5000,
      });
      await seedLoss({
        materialId: biscuit.id,
        quantity: 5,
        reason: 'BREAKAGE',
        createdAt: '2098-03-05T15:00:00.000Z',
      });
      await seedLoss({
        materialId: biscuit.id,
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

      const dataset = await getDataset({
        from: '2098-03-01T03:00:00.000Z',
        to: '2098-04-01T03:00:00.000Z',
      });

      // 5,00 + 2,00 + 3,36
      expect(dataset.byMonth).toEqual([{ month: '2098-03', lossCount: 3, lossValue: '10.36' }]);
      expect(dataset.byReason.find((c) => c.reason === 'BREAKAGE')).toEqual({
        reason: 'BREAKAGE',
        lossCount: 2,
        lossValue: '8.36',
      });
      expect(dataset.byReason.find((c) => c.reason === 'EXPIRED')).toEqual({
        reason: 'EXPIRED',
        lossCount: 1,
        lossValue: '2.00',
      });
      expect(dataset.byReason.find((c) => c.reason === 'OTHER')?.lossCount).toBe(0);
      expect(
        dataset.byMaterial.filter((cell) => [biscuit.id, flour.id].includes(cell.materialId)),
      ).toEqual([
        { materialId: biscuit.id, materialName: biscuit.name, lossCount: 2, lossValue: '7.00' },
        { materialId: flour.id, materialName: flour.name, lossCount: 1, lossValue: '3.36' },
      ]);
    });

    it('uses the calendar of Sao Paulo: 21:30 on 31 March is still March', async () => {
      const biscuit = await createMaterial({ stockQuantity: 50 });
      await seedLoss({
        materialId: biscuit.id,
        quantity: 1,
        reason: 'BREAKAGE',
        createdAt: '2096-04-01T00:30:00.000Z',
      });

      const dataset = await getDataset({
        from: '2096-03-01T03:00:00.000Z',
        to: '2096-05-01T03:00:00.000Z',
      });

      expect(dataset.byMonth).toEqual([
        { month: '2096-03', lossCount: 1, lossValue: '1.00' },
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
      expect(dataset.byMaterial).toEqual([]);
    });

    it('refuses a request without the whole period', async () => {
      await request(server)
        .get('/materials/losses/dataset')
        .set('Authorization', authHeader)
        .query({ from: '2098-03-01T03:00:00.000Z' })
        .expect(HttpStatus.BAD_REQUEST);
    });
  });

  describe('DELETE /materials/losses/:lossId', () => {
    const removeLoss = (lossId: string) =>
      request(server).delete(`/materials/losses/${lossId}`).set('Authorization', authHeader);

    // 10 biscuits, 5 lost by mistake: removing the loss clears the total, and the
    // stock stays at 5 until the user puts the 5 back.
    it('removes the loss, answers with what was removed and leaves the stock alone', async () => {
      const { id, name } = await createMaterial();
      const loss = (
        await postLoss(id, { quantity: 5, reason: 'BREAKAGE' }).expect(HttpStatus.CREATED)
      ).body as StockLossResultView;

      const response = await removeLoss(loss.id).expect(HttpStatus.OK);

      expect(response.body).toMatchObject({
        id: loss.id,
        materialId: id,
        materialName: name,
        quantity: 5,
        value: '5.00',
      });
      expect((await getMaterial(id)).stockQuantity).toBe(5);
      expect(await prisma.stockLoss.count({ where: { materialId: id } })).toBe(0);
    });

    it('takes the loss out of the list and out of the monthly total', async () => {
      const { id } = await createMaterial({ stockQuantity: 50 });
      const kept = await prisma.stockLoss.create({
        data: {
          id: randomUUID(),
          materialId: id,
          quantity: 1,
          reason: 'LOST',
          costBasisAmount: '1.00',
          costBasisQuantity: 1,
          createdAt: new Date('2094-03-05T15:00:00.000Z'),
        },
      });
      const wrong = await prisma.stockLoss.create({
        data: {
          id: randomUUID(),
          materialId: id,
          quantity: 5,
          reason: 'BREAKAGE',
          costBasisAmount: '1.00',
          costBasisQuantity: 1,
          createdAt: new Date('2094-03-06T15:00:00.000Z'),
        },
      });
      const period = { from: '2094-03-01T03:00:00.000Z', to: '2094-04-01T03:00:00.000Z' };
      const monthTotal = async () =>
        (
          (
            await request(server)
              .get('/materials/losses/dataset')
              .set('Authorization', authHeader)
              .query(period)
              .expect(HttpStatus.OK)
          ).body as StockLossDatasetView
        ).byMonth[0].lossValue;
      expect(await monthTotal()).toBe('6.00');

      await removeLoss(wrong.id).expect(HttpStatus.OK);

      expect(await monthTotal()).toBe('1.00');
      const list = (
        await request(server)
          .get('/materials/losses')
          .set('Authorization', authHeader)
          .query({ materialId: id })
          .expect(HttpStatus.OK)
      ).body as StockLossPageView;
      expect(list.items.map((item) => item.id)).toEqual([kept.id]);
    });

    it('answers 422 STOCK_LOSS_NOT_FOUND for a loss that does not exist or was already removed', async () => {
      const { id } = await createMaterial();
      const loss = (await postLoss(id, { quantity: 1, reason: 'LOST' }).expect(HttpStatus.CREATED))
        .body as StockLossResultView;

      const unknown = await removeLoss(randomUUID()).expect(HttpStatus.UNPROCESSABLE_ENTITY);
      await removeLoss(loss.id).expect(HttpStatus.OK);
      const again = await removeLoss(loss.id).expect(HttpStatus.UNPROCESSABLE_ENTITY);

      expect((unknown.body as ErrorResponseBody).code).toBe('STOCK_LOSS_NOT_FOUND');
      expect((again.body as ErrorResponseBody).code).toBe('STOCK_LOSS_NOT_FOUND');
    });

    it('lets the Material be deleted once its only loss is removed', async () => {
      const { id } = await createMaterial();
      const loss = (await postLoss(id, { quantity: 1, reason: 'LOST' }).expect(HttpStatus.CREATED))
        .body as StockLossResultView;
      await request(server)
        .delete(`/materials/${id}`)
        .set('Authorization', authHeader)
        .expect(HttpStatus.UNPROCESSABLE_ENTITY);

      await removeLoss(loss.id).expect(HttpStatus.OK);

      await request(server)
        .delete(`/materials/${id}`)
        .set('Authorization', authHeader)
        .expect(HttpStatus.NO_CONTENT);
    });

    it('stays in the audit trail, with what was removed', async () => {
      const { id } = await createMaterial();
      const loss = (
        await postLoss(id, { quantity: 5, reason: 'BREAKAGE' }).expect(HttpStatus.CREATED)
      ).body as StockLossResultView;
      await removeLoss(loss.id).expect(HttpStatus.OK);

      const response = await request(server)
        .get('/audit-log/activity')
        .set('Authorization', authHeader)
        .query({ limit: 100 })
        .expect(HttpStatus.OK);
      const entries = (
        response.body as {
          items: {
            entityType: string;
            entityId: string;
            operation: string;
            changes: Record<string, { old: unknown }>;
          }[];
        }
      ).items.filter((item) => item.entityId === loss.id);

      expect(entries.map((entry) => entry.operation).sort()).toEqual(['CREATE', 'DELETE']);
      const deletion = entries.find((entry) => entry.operation === 'DELETE');
      expect(deletion?.entityType).toBe('StockLoss');
      expect(deletion?.changes.reason.old).toBe('BREAKAGE');
    });
  });

  describe('ENTITY_IN_USE', () => {
    it('counts the losses, and refuses to delete a Material that has any', async () => {
      const { id } = await createMaterial();
      await postLoss(id, { quantity: 1, reason: 'BREAKAGE' }).expect(HttpStatus.CREATED);
      await postLoss(id, { quantity: 1, reason: 'LOST' }).expect(HttpStatus.CREATED);

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
        stockLosses: 2,
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

  describe('the activity feed', () => {
    it('shows a loss, with the reason in the changes', async () => {
      const { id } = await createMaterial();
      const loss = (
        await postLoss(id, { quantity: 1, reason: 'EXPIRED' }).expect(HttpStatus.CREATED)
      ).body as StockLossResultView;

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

      expect(entry).toMatchObject({ entityType: 'StockLoss', operation: 'CREATE' });
      expect(entry?.changes.reason.new).toBe('EXPIRED');
      expect(entry?.changes.materialId.new).toBe(id);
    });
  });
});
