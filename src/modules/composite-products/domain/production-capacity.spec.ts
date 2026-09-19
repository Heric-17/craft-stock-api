import { calculateProductionCapacity, type ProductionCapacityLine } from './production-capacity';

describe('calculateProductionCapacity', () => {
  it('computes capacity for a single-Material recipe', () => {
    const result = calculateProductionCapacity([
      { materialId: 'flour', quantity: 120, stockQuantity: 1000 },
    ]);

    expect(result.productionCapacity).toBe(8);
    expect(result.bottleneck).toEqual({ materialId: 'flour', possibleUnits: 8 });
  });

  it('identifies the bottleneck when it is the first item', () => {
    const lines: ProductionCapacityLine[] = [
      { materialId: 'flour', quantity: 120, stockQuantity: 240 }, // possibleUnits = 2
      { materialId: 'sugar', quantity: 60, stockQuantity: 1200 }, // possibleUnits = 20
      { materialId: 'eggs', quantity: 2, stockQuantity: 100 }, // possibleUnits = 50
    ];

    const result = calculateProductionCapacity(lines);

    expect(result.productionCapacity).toBe(2);
    expect(result.bottleneck?.materialId).toBe('flour');
  });

  it('identifies the bottleneck when it is a middle item', () => {
    const lines: ProductionCapacityLine[] = [
      { materialId: 'flour', quantity: 120, stockQuantity: 1200 }, // possibleUnits = 10
      { materialId: 'sugar', quantity: 60, stockQuantity: 180 }, // possibleUnits = 3
      { materialId: 'eggs', quantity: 2, stockQuantity: 100 }, // possibleUnits = 50
    ];

    const result = calculateProductionCapacity(lines);

    expect(result.productionCapacity).toBe(3);
    expect(result.bottleneck?.materialId).toBe('sugar');
  });

  it('identifies the bottleneck when it is the last item', () => {
    const lines: ProductionCapacityLine[] = [
      { materialId: 'flour', quantity: 120, stockQuantity: 1200 }, // possibleUnits = 10
      { materialId: 'sugar', quantity: 60, stockQuantity: 1200 }, // possibleUnits = 20
      { materialId: 'eggs', quantity: 2, stockQuantity: 6 }, // possibleUnits = 3
    ];

    const result = calculateProductionCapacity(lines);

    expect(result.productionCapacity).toBe(3);
    expect(result.bottleneck?.materialId).toBe('eggs');
  });

  it('returns zero capacity when the quantity used exceeds the stock', () => {
    const result = calculateProductionCapacity([
      { materialId: 'flour', quantity: 120, stockQuantity: 50 },
    ]);

    expect(result.productionCapacity).toBe(0);
    expect(result.bottleneck?.materialId).toBe('flour');
  });

  it('breaks a tie between two Materials by keeping the first one listed', () => {
    const lines: ProductionCapacityLine[] = [
      { materialId: 'flour', quantity: 120, stockQuantity: 240 }, // possibleUnits = 2
      { materialId: 'sugar', quantity: 60, stockQuantity: 120 }, // possibleUnits = 2 (tie)
      { materialId: 'eggs', quantity: 2, stockQuantity: 100 }, // possibleUnits = 50
    ];

    const result = calculateProductionCapacity(lines);

    expect(result.productionCapacity).toBe(2);
    expect(result.bottleneck?.materialId).toBe('flour');
  });

  it('reports possibleUnits for every Material in the recipe', () => {
    const result = calculateProductionCapacity([
      { materialId: 'flour', quantity: 120, stockQuantity: 240 },
      { materialId: 'sugar', quantity: 60, stockQuantity: 1200 },
    ]);

    expect(result.perMaterial).toEqual([
      { materialId: 'flour', possibleUnits: 2 },
      { materialId: 'sugar', possibleUnits: 20 },
    ]);
  });

  it('returns zero capacity and no bottleneck for a recipe with no items', () => {
    const result = calculateProductionCapacity([]);

    expect(result.productionCapacity).toBe(0);
    expect(result.bottleneck).toBeNull();
  });
});
