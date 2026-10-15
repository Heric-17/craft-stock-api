import type { RepositoryContext } from '../../../../shared/domain/persistence/unit-of-work';
import { InMemoryUnitOfWork } from '../../../../shared/infrastructure/persistence/in-memory-unit-of-work';
import { Money } from '../../../../shared/domain/money/money';
import { Material } from '../../domain/material.entity';
import {
  InsufficientStockError,
  InvalidStockAdjustmentError,
  MaterialNotFoundError,
  StockAdjustmentAlreadyReversedError,
  StockAdjustmentNotFoundError,
} from '../../domain/material.error';
import { StockAdjustment } from '../../domain/stock-adjustment.entity';
import { InMemoryMaterialRepository } from '../../infrastructure/persistence/in-memory-material.repository';
import { InMemoryStockAdjustmentRepository } from '../../infrastructure/persistence/in-memory-stock-adjustment.repository';
import { StockAdjustmentsService } from './stock-adjustments.service';

function buildMaterial(
  overrides: Partial<ConstructorParameters<typeof Material>[0]> = {},
): Material {
  return new Material({
    id: 'wine',
    name: 'Vinho',
    description: null,
    imageKey: null,
    packageCost: Money.fromDecimalString('40.00'),
    packageQuantity: 1,
    consumptionUnit: 'UNIT',
    stockQuantity: 2,
    minimumStockAlert: 1,
    discontinuedAt: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  });
}

function buildService(): {
  service: StockAdjustmentsService;
  materials: InMemoryMaterialRepository;
  stockAdjustments: InMemoryStockAdjustmentRepository;
} {
  const materials = new InMemoryMaterialRepository();
  const stockAdjustments = new InMemoryStockAdjustmentRepository();
  const context = { materials, stockAdjustments } as unknown as RepositoryContext;

  return {
    service: new StockAdjustmentsService(new InMemoryUnitOfWork(context)),
    materials,
    stockAdjustments,
  };
}

describe('StockAdjustmentsService.record', () => {
  describe('a loss', () => {
    it('takes the quantity out of stock and records it, with its reason', async () => {
      const { service, materials, stockAdjustments } = buildService();
      await materials.save(buildMaterial());

      const result = await service.record('wine', {
        kind: 'MANUAL_LOSS',
        quantity: 1,
        reason: 'BREAKAGE',
        observation: 'caiu da prateleira',
      });

      expect(result).toMatchObject({
        kind: 'MANUAL_LOSS',
        quantityDelta: -1,
        reason: 'BREAKAGE',
        observation: 'caiu da prateleira',
        value: '40.00',
        stockQuantityAfter: 1,
      });
      expect((await materials.findById('wine'))?.stockQuantity).toBe(1);
      expect(stockAdjustments.all()).toHaveLength(1);
    });

    it('freezes the cost of the moment as a fraction, and the value comes from it', async () => {
      const { service, materials, stockAdjustments } = buildService();
      await materials.save(
        buildMaterial({
          id: 'flour',
          packageCost: Money.fromDecimalString('28.00'),
          packageQuantity: 1000,
          consumptionUnit: 'GRAM',
          stockQuantity: 500,
        }),
      );

      const result = await service.record('flour', {
        kind: 'MANUAL_LOSS',
        quantity: 120,
        reason: 'SPOILAGE',
      });

      const [stored] = stockAdjustments.all();
      expect(stored.costBasisAmount.toDecimalString()).toBe('28.00');
      expect(stored.costBasisQuantity).toBe(1000);
      expect(result.value).toBe('3.36');
    });

    it('does not change the value of a loss when the cost of the Material changes later', async () => {
      const { service, materials, stockAdjustments } = buildService();
      await materials.save(buildMaterial());
      const recorded = await service.record('wine', {
        kind: 'MANUAL_LOSS',
        quantity: 1,
        reason: 'BREAKAGE',
      });

      const current = (await materials.findById('wine')) as Material;
      await materials.save(
        current.update({ packageCost: Money.fromDecimalString('55.00') }, new Date()),
      );

      const [stored] = stockAdjustments.all();
      expect(stored.value.toDecimalString()).toBe(recorded.value);
      expect(stored.value.toDecimalString()).toBe('40.00');
    });

    it('refuses more than the balance, tells the balance, and writes nothing', async () => {
      const { service, materials, stockAdjustments } = buildService();
      await materials.save(buildMaterial({ stockQuantity: 1 }));

      let caught: unknown;
      try {
        await service.record('wine', { kind: 'MANUAL_LOSS', quantity: 5, reason: 'BREAKAGE' });
      } catch (error) {
        caught = error;
      }

      expect(caught).toBeInstanceOf(InsufficientStockError);
      expect((caught as InsufficientStockError).details).toEqual({
        materialId: 'wine',
        stockQuantity: 1,
        requestedQuantity: 5,
      });
      expect((await materials.findById('wine'))?.stockQuantity).toBe(1);
      expect(stockAdjustments.all()).toHaveLength(0);
    });

    it('lets the whole balance go', async () => {
      const { service, materials } = buildService();
      await materials.save(buildMaterial({ stockQuantity: 2 }));

      const result = await service.record('wine', {
        kind: 'MANUAL_LOSS',
        quantity: 2,
        reason: 'EXPIRED',
      });

      expect(result.stockQuantityAfter).toBe(0);
    });

    it('records a loss on a discontinued Material', async () => {
      const { service, materials } = buildService();
      await materials.save(buildMaterial({ discontinuedAt: new Date('2026-02-01T00:00:00Z') }));

      const result = await service.record('wine', {
        kind: 'MANUAL_LOSS',
        quantity: 1,
        reason: 'BREAKAGE',
      });

      expect(result.stockQuantityAfter).toBe(1);
    });

    it('throws MaterialNotFoundError for an unknown Material', async () => {
      const { service } = buildService();

      await expect(
        service.record('nothing', { kind: 'MANUAL_LOSS', quantity: 1, reason: 'LOST' }),
      ).rejects.toThrow(MaterialNotFoundError);
    });

    it('treats a blank observation as none', async () => {
      const { service, materials } = buildService();
      await materials.save(buildMaterial());

      const result = await service.record('wine', {
        kind: 'MANUAL_LOSS',
        quantity: 1,
        reason: 'OTHER',
        observation: '   ',
      });

      expect(result.observation).toBeNull();
    });
  });

  describe('a reversal', () => {
    it('puts the stock back and points at the loss, which stays where it is', async () => {
      const { service, materials, stockAdjustments } = buildService();
      await materials.save(buildMaterial());
      const loss = await service.record('wine', {
        kind: 'MANUAL_LOSS',
        quantity: 1,
        reason: 'BREAKAGE',
      });

      const reversal = await service.record('wine', {
        kind: 'REVERSAL',
        reversedAdjustmentId: loss.id,
        observation: 'não quebrou',
      });

      expect(reversal).toMatchObject({
        kind: 'REVERSAL',
        quantityDelta: 1,
        reversedAdjustmentId: loss.id,
        value: '40.00',
        stockQuantityAfter: 2,
      });
      expect((await materials.findById('wine'))?.stockQuantity).toBe(2);
      // Nothing is deleted: the loss and its reversal are both there.
      expect(stockAdjustments.all().map((entry) => entry.kind)).toEqual([
        'MANUAL_LOSS',
        'REVERSAL',
      ]);
    });

    it('reverses at the cost the loss froze, not the cost of today', async () => {
      const { service, materials } = buildService();
      await materials.save(buildMaterial());
      const loss = await service.record('wine', {
        kind: 'MANUAL_LOSS',
        quantity: 1,
        reason: 'BREAKAGE',
      });
      const current = (await materials.findById('wine')) as Material;
      await materials.save(
        current.update({ packageCost: Money.fromDecimalString('90.00') }, new Date()),
      );

      const reversal = await service.record('wine', {
        kind: 'REVERSAL',
        reversedAdjustmentId: loss.id,
      });

      expect(reversal.value).toBe(loss.value);
      expect(reversal.costBasisAmount).toBe('40.00');
    });

    it('refuses to reverse the same entry twice', async () => {
      const { service, materials } = buildService();
      await materials.save(buildMaterial());
      const loss = await service.record('wine', {
        kind: 'MANUAL_LOSS',
        quantity: 1,
        reason: 'BREAKAGE',
      });
      await service.record('wine', { kind: 'REVERSAL', reversedAdjustmentId: loss.id });

      await expect(
        service.record('wine', { kind: 'REVERSAL', reversedAdjustmentId: loss.id }),
      ).rejects.toThrow(StockAdjustmentAlreadyReversedError);
    });

    it('refuses to reverse a reversal', async () => {
      const { service, materials } = buildService();
      await materials.save(buildMaterial());
      const loss = await service.record('wine', {
        kind: 'MANUAL_LOSS',
        quantity: 1,
        reason: 'BREAKAGE',
      });
      const reversal = await service.record('wine', {
        kind: 'REVERSAL',
        reversedAdjustmentId: loss.id,
      });

      await expect(
        service.record('wine', { kind: 'REVERSAL', reversedAdjustmentId: reversal.id }),
      ).rejects.toThrow(InvalidStockAdjustmentError);
    });

    it('refuses an entry that belongs to another Material', async () => {
      const { service, materials } = buildService();
      await materials.save(buildMaterial());
      await materials.save(buildMaterial({ id: 'cork', name: 'Rolha' }));
      const loss = await service.record('wine', {
        kind: 'MANUAL_LOSS',
        quantity: 1,
        reason: 'BREAKAGE',
      });

      await expect(
        service.record('cork', { kind: 'REVERSAL', reversedAdjustmentId: loss.id }),
      ).rejects.toThrow(InvalidStockAdjustmentError);
    });

    it('throws StockAdjustmentNotFoundError for an entry that does not exist', async () => {
      const { service, materials } = buildService();
      await materials.save(buildMaterial());

      await expect(
        service.record('wine', { kind: 'REVERSAL', reversedAdjustmentId: 'nope' }),
      ).rejects.toThrow(StockAdjustmentNotFoundError);
    });

    it('refuses to reverse an entry when the stock it put in is already gone, with the balance', async () => {
      const { service, materials, stockAdjustments } = buildService();
      await materials.save(buildMaterial({ stockQuantity: 0 }));
      const entry = new StockAdjustment({
        id: 'entry-1',
        materialId: 'wine',
        kind: 'MANUAL_ENTRY',
        quantityDelta: 4,
        reason: null,
        observation: null,
        costBasisAmount: Money.fromDecimalString('40.00'),
        costBasisQuantity: 1,
        reversedAdjustmentId: null,
        createdAt: new Date('2026-02-01T00:00:00Z'),
      });
      await stockAdjustments.save(entry);

      let caught: unknown;
      try {
        await service.record('wine', { kind: 'REVERSAL', reversedAdjustmentId: 'entry-1' });
      } catch (error) {
        caught = error;
      }

      expect(caught).toBeInstanceOf(InsufficientStockError);
      expect((caught as InsufficientStockError).details).toEqual({
        materialId: 'wine',
        stockQuantity: 0,
        requestedQuantity: 4,
      });
      // The refused reversal left no record behind.
      expect(stockAdjustments.all()).toHaveLength(1);
    });
  });
});
