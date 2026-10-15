import { Money } from '../../../../shared/domain/money/money';
import { Material } from '../../domain/material.entity';
import { StockAdjustment } from '../../domain/stock-adjustment.entity';
import type { StockLossReason } from '../../domain/stock-loss-reason.enum';
import { InMemoryStockLossDatasetAdapter } from '../../infrastructure/analytics/in-memory-stock-loss-dataset.adapter';
import { InMemoryMaterialRepository } from '../../infrastructure/persistence/in-memory-material.repository';
import { InMemoryStockAdjustmentRepository } from '../../infrastructure/persistence/in-memory-stock-adjustment.repository';
import { MaterialLossesService } from './material-losses.service';

function buildMaterial(id: string, name: string, packageCost = '40.00'): Material {
  return new Material({
    id,
    name,
    description: null,
    imageKey: null,
    packageCost: Money.fromDecimalString(packageCost),
    packageQuantity: 1,
    consumptionUnit: 'UNIT',
    stockQuantity: 10,
    minimumStockAlert: 1,
    discontinuedAt: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
  });
}

async function setup() {
  const materials = new InMemoryMaterialRepository();
  const adjustments = new InMemoryStockAdjustmentRepository();
  await materials.save(buildMaterial('wine', 'Vinho'));
  await materials.save(buildMaterial('cork', 'Rolha', '2.00'));

  const service = new MaterialLossesService(
    adjustments,
    materials,
    new InMemoryStockLossDatasetAdapter(adjustments, materials),
  );

  const loss = async (input: {
    id: string;
    materialId: string;
    quantity: number;
    reason: StockLossReason;
    createdAt: string;
    costBasisAmount?: string;
  }) => {
    const entry = new StockAdjustment({
      id: input.id,
      materialId: input.materialId,
      kind: 'MANUAL_LOSS',
      quantityDelta: -input.quantity,
      reason: input.reason,
      observation: null,
      costBasisAmount: Money.fromDecimalString(input.costBasisAmount ?? '40.00'),
      costBasisQuantity: 1,
      reversedAdjustmentId: null,
      createdAt: new Date(input.createdAt),
    });
    await adjustments.save(entry);
    return entry;
  };

  return { service, adjustments, loss };
}

describe('MaterialLossesService', () => {
  describe('list', () => {
    it('pages the losses newest first and reports the size of the whole filtered set', async () => {
      const { service, loss } = await setup();
      await loss({
        id: 'a',
        materialId: 'wine',
        quantity: 1,
        reason: 'BREAKAGE',
        createdAt: '2026-03-01T12:00:00Z',
      });
      await loss({
        id: 'b',
        materialId: 'wine',
        quantity: 1,
        reason: 'BREAKAGE',
        createdAt: '2026-03-03T12:00:00Z',
      });
      await loss({
        id: 'c',
        materialId: 'wine',
        quantity: 1,
        reason: 'BREAKAGE',
        createdAt: '2026-03-02T12:00:00Z',
      });

      const first = await service.list({ limit: 2, offset: 0 });
      const second = await service.list({ limit: 2, offset: 2 });

      expect(first.items.map((item) => item.id)).toEqual(['b', 'c']);
      expect(second.items.map((item) => item.id)).toEqual(['a']);
      expect(first).toMatchObject({ total: 3, limit: 2, offset: 0 });
    });

    it('breaks a tie on the id, so losses at the same instant keep their place', async () => {
      const { service, loss } = await setup();
      for (const id of ['m', 'z', 'a', 'q']) {
        await loss({
          id,
          materialId: 'wine',
          quantity: 1,
          reason: 'LOST',
          createdAt: '2026-03-01T12:00:00Z',
        });
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
      const { service, loss } = await setup();
      await loss({
        id: 'a',
        materialId: 'wine',
        quantity: 1,
        reason: 'BREAKAGE',
        createdAt: '2026-03-01T12:00:00Z',
      });
      await loss({
        id: 'b',
        materialId: 'cork',
        quantity: 1,
        reason: 'EXPIRED',
        createdAt: '2026-03-02T12:00:00Z',
      });
      await loss({
        id: 'c',
        materialId: 'wine',
        quantity: 1,
        reason: 'EXPIRED',
        createdAt: '2026-04-02T12:00:00Z',
      });

      const byReason = await service.list({ reason: 'EXPIRED', limit: 1, offset: 0 });
      const byMaterial = await service.list({ materialId: 'wine', limit: 10, offset: 0 });
      const byPeriod = await service.list({
        from: new Date('2026-03-01T00:00:00Z'),
        to: new Date('2026-04-01T00:00:00Z'),
        limit: 10,
        offset: 0,
      });

      expect(byReason.total).toBe(2);
      expect(byReason.items.map((item) => item.id)).toEqual(['c']);
      expect(byMaterial.items.map((item) => item.id)).toEqual(['c', 'a']);
      expect(byPeriod.items.map((item) => item.id)).toEqual(['b', 'a']);
    });

    it('shows the material name, the value from the frozen cost and the reversal that undid it', async () => {
      const { service, adjustments, loss } = await setup();
      const original = await loss({
        id: 'a',
        materialId: 'wine',
        quantity: 2,
        reason: 'BREAKAGE',
        createdAt: '2026-03-01T12:00:00Z',
      });
      await adjustments.save(
        StockAdjustment.reversing(original, {
          id: 'undo',
          observation: null,
          createdAt: new Date('2026-03-02T12:00:00Z'),
        }),
      );

      const page = await service.list({ limit: 10, offset: 0 });

      expect(page.items).toHaveLength(1);
      expect(page.items[0]).toMatchObject({
        id: 'a',
        materialName: 'Vinho',
        quantityDelta: -2,
        value: '80.00',
        reversedByAdjustmentId: 'undo',
      });
    });

    it('answers an offset past the total with an empty page', async () => {
      const { service, loss } = await setup();
      await loss({
        id: 'a',
        materialId: 'wine',
        quantity: 1,
        reason: 'LOST',
        createdAt: '2026-03-01T12:00:00Z',
      });

      const page = await service.list({ limit: 10, offset: 50 });

      expect(page).toMatchObject({ items: [], total: 1, offset: 50 });
    });
  });

  describe('getDataset', () => {
    it('leaves a reversed loss out of every cell', async () => {
      const { service, adjustments, loss } = await setup();
      await loss({
        id: 'kept',
        materialId: 'wine',
        quantity: 1,
        reason: 'BREAKAGE',
        createdAt: '2026-03-05T12:00:00Z',
      });
      const undone = await loss({
        id: 'undone',
        materialId: 'cork',
        quantity: 5,
        reason: 'LOST',
        createdAt: '2026-03-06T12:00:00Z',
        costBasisAmount: '2.00',
      });
      await adjustments.save(
        StockAdjustment.reversing(undone, {
          id: 'undo',
          observation: null,
          createdAt: new Date('2026-04-02T12:00:00Z'),
        }),
      );

      const dataset = await service.getDataset({
        from: new Date('2026-03-01T03:00:00Z'),
        to: new Date('2026-05-01T03:00:00Z'),
      });

      // Gone from March, where it was recorded, not from the month of the reversal.
      expect(dataset.byMonth).toEqual([
        { month: '2026-03', lossCount: 1, lossValue: '40.00' },
        { month: '2026-04', lossCount: 0, lossValue: '0.00' },
      ]);
      expect(dataset.byMaterial.map((cell) => cell.materialId)).toEqual(['wine']);
      expect(dataset.byReason.find((cell) => cell.reason === 'LOST')?.lossCount).toBe(0);
    });

    it('serializes every amount as a two-place decimal string', async () => {
      const { service, loss } = await setup();
      await loss({
        id: 'a',
        materialId: 'wine',
        quantity: 3,
        reason: 'SPOILAGE',
        createdAt: '2026-03-05T12:00:00Z',
      });

      const dataset = await service.getDataset({
        from: new Date('2026-03-01T03:00:00Z'),
        to: new Date('2026-04-01T03:00:00Z'),
      });

      expect(dataset.byMonth[0].lossValue).toBe('120.00');
      expect(typeof dataset.byMaterial[0].lossValue).toBe('string');
    });
  });
});
