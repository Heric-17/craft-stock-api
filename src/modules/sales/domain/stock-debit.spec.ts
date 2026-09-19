import { calculateStockDebit } from './stock-debit';

describe('calculateStockDebit', () => {
  it('debits exactly the needed quantity when stock covers it', () => {
    const [result] = calculateStockDebit([
      { materialId: 'flour', needed: 240, stockQuantity: 1000 },
    ]);

    expect(result.debited).toBe(240);
  });

  it('caps the debit at the available stock when stock does not cover the need', () => {
    const [result] = calculateStockDebit([
      { materialId: 'flour', needed: 240, stockQuantity: 100 },
    ]);

    expect(result.debited).toBe(100);
  });

  it('debits zero, never negative, when stock is already zero', () => {
    const [result] = calculateStockDebit([{ materialId: 'flour', needed: 240, stockQuantity: 0 }]);

    expect(result.debited).toBe(0);
  });

  it('debits exactly the stock when need equals stock', () => {
    const [result] = calculateStockDebit([
      { materialId: 'flour', needed: 240, stockQuantity: 240 },
    ]);

    expect(result.debited).toBe(240);
  });

  it('computes each line independently', () => {
    const results = calculateStockDebit([
      { materialId: 'flour', needed: 240, stockQuantity: 1000 },
      { materialId: 'sugar', needed: 120, stockQuantity: 50 },
    ]);

    expect(results).toEqual([
      { materialId: 'flour', debited: 240 },
      { materialId: 'sugar', debited: 50 },
    ]);
  });
});
