import { Money } from '../../../../shared/domain/money/money';
import { Material } from '../../domain/material.entity';
import { InMemoryMaterialInventorySummaryAdapter } from '../../infrastructure/analytics/in-memory-material-inventory-summary.adapter';
import { InMemoryMaterialRepository } from '../../infrastructure/persistence/in-memory-material.repository';
import { MaterialInventoryService } from './material-inventory.service';

function buildSuite(): {
  repository: InMemoryMaterialRepository;
  service: MaterialInventoryService;
} {
  const repository = new InMemoryMaterialRepository();

  return {
    repository,
    service: new MaterialInventoryService(new InMemoryMaterialInventorySummaryAdapter(repository)),
  };
}

function material(id: string, discontinuedAt: Date | null = null, stockQuantity = 1): Material {
  const now = new Date('2026-01-01T00:00:00Z');

  return new Material({
    id,
    name: `Insumo ${id}`,
    description: null,
    imageKey: null,
    packageCost: Money.fromDecimalString('10.00'),
    packageQuantity: 3,
    consumptionUnit: 'GRAM',
    stockQuantity,
    minimumStockAlert: 0,
    discontinuedAt,
    createdAt: now,
    updatedAt: now,
  });
}

describe('MaterialInventoryService.getSummary', () => {
  it('reports zeros when there is nothing in stock to count', async () => {
    const { service } = buildSuite();

    await expect(service.getSummary()).resolves.toEqual({
      materialCount: 0,
      belowMinimumCount: 0,
      totalStockValue: '0.00',
    });
  });

  it('leaves discontinued Materials out by default', async () => {
    const { repository, service } = buildSuite();
    await repository.save(material('active'));
    await repository.save(material('discontinued', new Date('2026-02-01T00:00:00Z')));

    const summary = await service.getSummary();

    expect(summary.materialCount).toBe(1);
    expect(summary.totalStockValue).toBe('3.33');
  });

  it('includes them when asked', async () => {
    const { repository, service } = buildSuite();
    await repository.save(material('active'));
    await repository.save(material('discontinued', new Date('2026-02-01T00:00:00Z')));

    const summary = await service.getSummary(true);

    expect(summary.materialCount).toBe(2);
    expect(summary.totalStockValue).toBe('6.66');
  });

  it('adds up the rounded value of each Material', async () => {
    const { repository, service } = buildSuite();
    for (const id of ['a', 'b', 'c']) {
      await repository.save(material(id));
    }

    // 3.33 + 3.33 + 3.33, not the 10.00 that rounding the exact sum would give.
    await expect(service.getSummary()).resolves.toEqual(
      expect.objectContaining({ totalStockValue: '9.99' }),
    );
  });
});
