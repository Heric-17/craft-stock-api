import type { RepositoryContext } from '../../../../shared/domain/persistence/unit-of-work';
import { InMemoryUnitOfWork } from '../../../../shared/infrastructure/persistence/in-memory-unit-of-work';
import { Money } from '../../../../shared/domain/money/money';
import { Material, type MaterialProps } from '../../domain/material.entity';
import {
  InsufficientStockError,
  MaterialNotFoundError,
  StockLossNotFoundError,
} from '../../domain/material.error';
import { StockLoss } from '../../domain/stock-loss.entity';
import { InMemoryStockLossDatasetAdapter } from '../../infrastructure/analytics/in-memory-stock-loss-dataset.adapter';
import { InMemoryMaterialRepository } from '../../infrastructure/persistence/in-memory-material.repository';
import { InMemoryStockLossRepository } from '../../infrastructure/persistence/in-memory-stock-loss.repository';
import { StockLossesService } from './stock-losses.service';

function buildMaterial(overrides: Partial<MaterialProps> = {}): Material {
  return new Material({
    id: 'biscuit',
    name: 'Bolacha',
    description: null,
    imageKey: null,
    packageCost: Money.fromDecimalString('1.00'),
    packageQuantity: 1,
    consumptionUnit: 'UNIT',
    stockQuantity: 10,
    minimumStockAlert: 2,
    discontinuedAt: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  });
}

function buildService() {
  const materials = new InMemoryMaterialRepository();
  const losses = new InMemoryStockLossRepository();
  const context = { materials, stockLosses: losses } as unknown as RepositoryContext;
  const service = new StockLossesService(
    new InMemoryUnitOfWork(context),
    losses,
    materials,
    new InMemoryStockLossDatasetAdapter(losses, materials),
  );

  return { service, materials, losses };
}

function storedLoss(id: string, materialId: string, createdAt: string, quantity = 1): StockLoss {
  return new StockLoss({
    id,
    materialId,
    quantity,
    reason: 'BREAKAGE',
    observation: null,
    costBasisAmount: Money.fromDecimalString('1.00'),
    costBasisQuantity: 1,
    createdAt: new Date(createdAt),
  });
}

describe('StockLossesService', () => {
  describe('record', () => {
    // 10 biscuits at R$ 1,00, 5 broke: 5 left, R$ 5,00 lost.
    it('takes the quantity out of stock and keeps the value lost', async () => {
      const { service, materials, losses } = buildService();
      await materials.save(buildMaterial());

      const result = await service.record('biscuit', {
        quantity: 5,
        reason: 'BREAKAGE',
        observation: 'caiu da caixa',
      });

      expect(result).toMatchObject({
        materialId: 'biscuit',
        materialName: 'Bolacha',
        consumptionUnit: 'UNIT',
        consumptionUnitSymbol: 'un',
        quantity: 5,
        reason: 'BREAKAGE',
        observation: 'caiu da caixa',
        value: '5.00',
        stockQuantityAfter: 5,
      });
      expect((await materials.findById('biscuit'))?.stockQuantity).toBe(5);
      expect(losses.all()).toHaveLength(1);
    });

    it('freezes the cost of the moment as a fraction', async () => {
      const { service, materials, losses } = buildService();
      await materials.save(
        buildMaterial({
          id: 'flour',
          packageCost: Money.fromDecimalString('28.00'),
          packageQuantity: 1000,
          consumptionUnit: 'GRAM',
          stockQuantity: 500,
        }),
      );

      const result = await service.record('flour', { quantity: 120, reason: 'SPOILAGE' });

      const [stored] = losses.all();
      expect(stored.costBasisAmount.toDecimalString()).toBe('28.00');
      expect(stored.costBasisQuantity).toBe(1000);
      expect(result.value).toBe('3.36');
    });

    it('does not change the value of a loss when the cost changes later', async () => {
      const { service, materials, losses } = buildService();
      await materials.save(buildMaterial());
      await service.record('biscuit', { quantity: 5, reason: 'BREAKAGE' });

      const current = (await materials.findById('biscuit')) as Material;
      await materials.save(
        current.update({ packageCost: Money.fromDecimalString('2.00') }, new Date()),
      );

      expect(losses.all()[0].value.toDecimalString()).toBe('5.00');
    });

    it('refuses more than the balance, tells the balance, and writes nothing', async () => {
      const { service, materials, losses } = buildService();
      await materials.save(buildMaterial({ stockQuantity: 3 }));

      let caught: unknown;
      try {
        await service.record('biscuit', { quantity: 5, reason: 'BREAKAGE' });
      } catch (error) {
        caught = error;
      }

      expect(caught).toBeInstanceOf(InsufficientStockError);
      expect((caught as InsufficientStockError).details).toEqual({
        materialId: 'biscuit',
        stockQuantity: 3,
        requestedQuantity: 5,
      });
      expect((await materials.findById('biscuit'))?.stockQuantity).toBe(3);
      expect(losses.all()).toHaveLength(0);
    });

    it('lets the whole balance go', async () => {
      const { service, materials } = buildService();
      await materials.save(buildMaterial());

      const result = await service.record('biscuit', { quantity: 10, reason: 'EXPIRED' });

      expect(result.stockQuantityAfter).toBe(0);
    });

    it('records a loss on a discontinued Material', async () => {
      const { service, materials } = buildService();
      await materials.save(buildMaterial({ discontinuedAt: new Date('2026-02-01T00:00:00Z') }));

      const result = await service.record('biscuit', { quantity: 1, reason: 'LOST' });

      expect(result.stockQuantityAfter).toBe(9);
    });

    it('treats a blank observation as none', async () => {
      const { service, materials } = buildService();
      await materials.save(buildMaterial());

      const result = await service.record('biscuit', {
        quantity: 1,
        reason: 'OTHER',
        observation: '   ',
      });

      expect(result.observation).toBeNull();
    });

    it('throws MaterialNotFoundError for an unknown Material', async () => {
      const { service } = buildService();

      await expect(service.record('nothing', { quantity: 1, reason: 'LOST' })).rejects.toThrow(
        MaterialNotFoundError,
      );
    });
  });

  describe('remove', () => {
    it('removes the loss and leaves the stock exactly as it is', async () => {
      const { service, materials, losses } = buildService();
      await materials.save(buildMaterial());
      const recorded = await service.record('biscuit', { quantity: 5, reason: 'BREAKAGE' });

      const removed = await service.remove(recorded.id);

      expect(removed).toMatchObject({
        id: recorded.id,
        materialName: 'Bolacha',
        consumptionUnit: 'UNIT',
        consumptionUnitSymbol: 'un',
        quantity: 5,
        value: '5.00',
      });
      expect(losses.all()).toHaveLength(0);
      // The loss took 5 out of 10, and removing it does not put them back.
      expect((await materials.findById('biscuit'))?.stockQuantity).toBe(5);
    });

    it('takes the loss out of the list and out of the totals', async () => {
      const { service, materials } = buildService();
      await materials.save(buildMaterial());
      const wrong = await service.record('biscuit', { quantity: 5, reason: 'BREAKAGE' });
      await service.record('biscuit', { quantity: 1, reason: 'LOST' });
      const period = {
        from: new Date(Date.now() - 24 * 60 * 60 * 1000),
        to: new Date(Date.now() + 24 * 60 * 60 * 1000),
      };

      await service.remove(wrong.id);

      const page = await service.list({ limit: 20, offset: 0 });
      const dataset = await service.getDataset(period);
      expect(page.total).toBe(1);
      expect(page.items[0].quantity).toBe(1);
      expect(dataset.byMaterial).toEqual([
        { materialId: 'biscuit', materialName: 'Bolacha', lossCount: 1, lossValue: '1.00' },
      ]);
    });

    it('throws StockLossNotFoundError for a loss that does not exist, or was already removed', async () => {
      const { service, materials } = buildService();
      await materials.save(buildMaterial());
      const recorded = await service.record('biscuit', { quantity: 1, reason: 'LOST' });

      await expect(service.remove('nothing')).rejects.toThrow(StockLossNotFoundError);

      await service.remove(recorded.id);
      await expect(service.remove(recorded.id)).rejects.toThrow(StockLossNotFoundError);
    });
  });

  describe('list', () => {
    it('pages the losses newest first, with the size of the whole filtered set', async () => {
      const { service, materials, losses } = buildService();
      await materials.save(buildMaterial());
      await losses.save(storedLoss('a', 'biscuit', '2026-03-01T12:00:00Z'));
      await losses.save(storedLoss('b', 'biscuit', '2026-03-03T12:00:00Z'));
      await losses.save(storedLoss('c', 'biscuit', '2026-03-02T12:00:00Z'));

      const first = await service.list({ limit: 2, offset: 0 });
      const second = await service.list({ limit: 2, offset: 2 });

      expect(first.items.map((item) => item.id)).toEqual(['b', 'c']);
      expect(second.items.map((item) => item.id)).toEqual(['a']);
      expect(first).toMatchObject({ total: 3, limit: 2, offset: 0 });
      expect(first.items[0]).toMatchObject({
        materialName: 'Bolacha',
        consumptionUnit: 'UNIT',
        consumptionUnitSymbol: 'un',
        value: '1.00',
      });
    });

    it('breaks a tie on the id, so losses at the same instant keep their place', async () => {
      const { service, materials, losses } = buildService();
      await materials.save(buildMaterial());
      for (const id of ['m', 'z', 'a', 'q']) {
        await losses.save(storedLoss(id, 'biscuit', '2026-03-01T12:00:00Z'));
      }

      const first = await service.list({ limit: 2, offset: 0 });
      const second = await service.list({ limit: 2, offset: 2 });

      expect([...first.items, ...second.items].map((item) => item.id)).toEqual([
        'z',
        'q',
        'm',
        'a',
      ]);
    });

    it('filters inside the query, so the total counts the filtered set', async () => {
      const { service, materials, losses } = buildService();
      await materials.save(buildMaterial());
      await materials.save(buildMaterial({ id: 'cork', name: 'Rolha' }));
      await losses.save(storedLoss('a', 'biscuit', '2026-03-01T12:00:00Z'));
      await losses.save(storedLoss('b', 'cork', '2026-03-02T12:00:00Z'));
      await losses.save(storedLoss('c', 'biscuit', '2026-04-02T12:00:00Z'));

      const byMaterial = await service.list({ materialId: 'biscuit', limit: 10, offset: 0 });
      const byPeriod = await service.list({
        from: new Date('2026-03-01T00:00:00Z'),
        to: new Date('2026-04-01T00:00:00Z'),
        limit: 10,
        offset: 0,
      });

      expect(byMaterial.items.map((item) => item.id)).toEqual(['c', 'a']);
      expect(byPeriod.items.map((item) => item.id)).toEqual(['b', 'a']);
      expect(byPeriod.total).toBe(2);
    });

    it('gives the unit of each Material, as it is now', async () => {
      const { service, materials, losses } = buildService();
      await materials.save(buildMaterial());
      await materials.save(
        buildMaterial({
          id: 'flour',
          name: 'Farinha',
          consumptionUnit: 'GRAM',
          stockQuantity: 500,
        }),
      );
      await losses.save(storedLoss('a', 'biscuit', '2026-03-01T12:00:00Z'));
      await losses.save(storedLoss('b', 'flour', '2026-03-02T12:00:00Z'));

      const page = await service.list({ limit: 10, offset: 0 });

      expect(
        page.items.map((item) => [item.id, item.consumptionUnit, item.consumptionUnitSymbol]),
      ).toEqual([
        ['b', 'GRAM', 'g'],
        ['a', 'UNIT', 'un'],
      ]);
    });

    it('answers an offset past the total with an empty page', async () => {
      const { service, materials, losses } = buildService();
      await materials.save(buildMaterial());
      await losses.save(storedLoss('a', 'biscuit', '2026-03-01T12:00:00Z'));

      const page = await service.list({ limit: 10, offset: 50 });

      expect(page).toMatchObject({ items: [], total: 1, offset: 50 });
    });
  });

  describe('getDataset', () => {
    it('adds up what was lost in the month, as strings with two places', async () => {
      const { service, materials } = buildService();
      await materials.save(buildMaterial());
      await service.record('biscuit', { quantity: 5, reason: 'BREAKAGE' });

      const now = new Date();
      const dataset = await service.getDataset({
        from: new Date(now.getTime() - 24 * 60 * 60 * 1000),
        to: new Date(now.getTime() + 24 * 60 * 60 * 1000),
      });

      const total = dataset.byMonth.reduce((sum, cell) => sum + Number(cell.lossValue), 0);
      expect(total).toBe(5);
      expect(dataset.byReason.find((cell) => cell.reason === 'BREAKAGE')).toMatchObject({
        lossCount: 1,
        lossValue: '5.00',
      });
      expect(dataset.byMaterial).toEqual([
        { materialId: 'biscuit', materialName: 'Bolacha', lossCount: 1, lossValue: '5.00' },
      ]);
    });
  });
});
