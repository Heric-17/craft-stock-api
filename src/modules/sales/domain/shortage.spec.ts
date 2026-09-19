import { calculateShortage } from './shortage';

describe('calculateShortage', () => {
  it('reports zero shortage when stock covers the need', () => {
    const [result] = calculateShortage([{ materialId: 'flour', needed: 240, stockQuantity: 1000 }]);

    expect(result.shortage).toBe(0);
  });

  it('reports the exact gap when stock does not cover the need', () => {
    const [result] = calculateShortage([{ materialId: 'flour', needed: 240, stockQuantity: 100 }]);

    expect(result.shortage).toBe(140);
  });

  it('never reports a negative shortage', () => {
    const [result] = calculateShortage([{ materialId: 'flour', needed: 100, stockQuantity: 1000 }]);

    expect(result.shortage).toBeGreaterThanOrEqual(0);
    expect(result.shortage).toBe(0);
  });

  it('computes each line independently', () => {
    const results = calculateShortage([
      { materialId: 'flour', needed: 240, stockQuantity: 1000 },
      { materialId: 'sugar', needed: 120, stockQuantity: 50 },
    ]);

    expect(results).toEqual([
      { materialId: 'flour', needed: 240, stockQuantity: 1000, shortage: 0 },
      { materialId: 'sugar', needed: 120, stockQuantity: 50, shortage: 70 },
    ]);
  });
});
