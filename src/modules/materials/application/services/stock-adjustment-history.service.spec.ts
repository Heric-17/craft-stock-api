import { Money } from '../../../../shared/domain/money/money';
import { Material } from '../../domain/material.entity';
import { MaterialNotFoundError } from '../../domain/material.error';
import { StockAdjustment } from '../../domain/stock-adjustment.entity';
import type { StockAdjustmentKind } from '../../domain/stock-adjustment-kind.enum';
import { InMemoryMaterialRepository } from '../../infrastructure/persistence/in-memory-material.repository';
import { InMemoryStockAdjustmentRepository } from '../../infrastructure/persistence/in-memory-stock-adjustment.repository';
import { StockAdjustmentHistoryService } from './stock-adjustment-history.service';

function buildMaterial(id: string): Material {
  return new Material({
    id,
    name: id,
    description: null,
    imageKey: null,
    packageCost: Money.fromDecimalString('40.00'),
    packageQuantity: 1,
    consumptionUnit: 'UNIT',
    stockQuantity: 10,
    minimumStockAlert: 1,
    discontinuedAt: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
  });
}

function buildAdjustment(
  id: string,
  createdAt: string,
  overrides: { materialId?: string; kind?: StockAdjustmentKind } = {},
): StockAdjustment {
  const kind = overrides.kind ?? 'MANUAL_ENTRY';

  return new StockAdjustment({
    id,
    materialId: overrides.materialId ?? 'wine',
    kind,
    quantityDelta: kind === 'MANUAL_LOSS' ? -1 : 1,
    reason: kind === 'MANUAL_LOSS' ? 'LOST' : null,
    observation: null,
    costBasisAmount: Money.fromDecimalString('40.00'),
    costBasisQuantity: 1,
    reversedAdjustmentId: null,
    createdAt: new Date(createdAt),
  });
}

async function setup() {
  const materials = new InMemoryMaterialRepository();
  const adjustments = new InMemoryStockAdjustmentRepository();
  await materials.save(buildMaterial('wine'));
  await materials.save(buildMaterial('cork'));

  return { service: new StockAdjustmentHistoryService(adjustments, materials), adjustments };
}

describe('StockAdjustmentHistoryService', () => {
  it('lists every kind, reversals included, newest first', async () => {
    const { service, adjustments } = await setup();
    const loss = buildAdjustment('loss', '2026-03-02T12:00:00Z', { kind: 'MANUAL_LOSS' });
    await adjustments.save(buildAdjustment('entry', '2026-03-01T12:00:00Z'));
    await adjustments.save(loss);
    await adjustments.save(
      StockAdjustment.reversing(loss, {
        id: 'undo',
        observation: null,
        createdAt: new Date('2026-03-03T12:00:00Z'),
      }),
    );

    const page = await service.list({ materialId: 'wine', limit: 20, offset: 0 });

    expect(page.items.map((item) => item.id)).toEqual(['undo', 'loss', 'entry']);
    expect(page.items.map((item) => item.kind)).toEqual([
      'REVERSAL',
      'MANUAL_LOSS',
      'MANUAL_ENTRY',
    ]);
    expect(page.total).toBe(3);
  });

  it('shows which entries were reversed and by what', async () => {
    const { service, adjustments } = await setup();
    const entry = buildAdjustment('entry', '2026-03-01T12:00:00Z');
    await adjustments.save(entry);
    await adjustments.save(
      StockAdjustment.reversing(entry, {
        id: 'undo',
        observation: null,
        createdAt: new Date('2026-03-02T12:00:00Z'),
      }),
    );

    const page = await service.list({ materialId: 'wine', limit: 20, offset: 0 });
    const byId = new Map(page.items.map((item) => [item.id, item]));

    expect(byId.get('entry')?.reversedByAdjustmentId).toBe('undo');
    expect(byId.get('undo')).toMatchObject({
      reversedByAdjustmentId: null,
      reversedAdjustmentId: 'entry',
    });
  });

  it('only shows the entries of the Material asked for', async () => {
    const { service, adjustments } = await setup();
    await adjustments.save(buildAdjustment('a', '2026-03-01T12:00:00Z'));
    await adjustments.save(buildAdjustment('b', '2026-03-01T12:00:00Z', { materialId: 'cork' }));

    const page = await service.list({ materialId: 'cork', limit: 20, offset: 0 });

    expect(page.items.map((item) => item.id)).toEqual(['b']);
    expect(page.total).toBe(1);
  });

  it('narrows to one kind inside the query, so the total counts the filtered set', async () => {
    const { service, adjustments } = await setup();
    await adjustments.save(buildAdjustment('entry', '2026-03-01T12:00:00Z'));
    await adjustments.save(
      buildAdjustment('loss', '2026-03-02T12:00:00Z', { kind: 'MANUAL_LOSS' }),
    );

    const page = await service.list({
      materialId: 'wine',
      kind: 'MANUAL_LOSS',
      limit: 1,
      offset: 0,
    });

    expect(page.items.map((item) => item.id)).toEqual(['loss']);
    expect(page.total).toBe(1);
  });

  it('pages without repeating or skipping an entry, breaking ties on the id', async () => {
    const { service, adjustments } = await setup();
    for (const id of ['m', 'z', 'a', 'q']) {
      await adjustments.save(buildAdjustment(id, '2026-03-01T12:00:00Z'));
    }

    const first = await service.list({ materialId: 'wine', limit: 2, offset: 0 });
    const second = await service.list({ materialId: 'wine', limit: 2, offset: 2 });

    expect([...first.items, ...second.items].map((item) => item.id)).toEqual(['z', 'q', 'm', 'a']);
  });

  it('throws MaterialNotFoundError for a Material that does not exist', async () => {
    const { service } = await setup();

    await expect(service.list({ materialId: 'nothing', limit: 20, offset: 0 })).rejects.toThrow(
      MaterialNotFoundError,
    );
  });
});
