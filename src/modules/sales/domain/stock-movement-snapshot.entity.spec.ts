import { InvalidSaleError } from './sale.error';
import { StockMovementSnapshot } from './stock-movement-snapshot.entity';

describe('StockMovementSnapshot', () => {
  it('records the debited quantity', () => {
    const snapshot = new StockMovementSnapshot({
      id: 'snapshot-1',
      saleId: 'sale-1',
      materialId: 'material-1',
      quantityDebited: 120,
      createdAt: new Date('2026-01-01T00:00:00Z'),
    });

    expect(snapshot.quantityDebited).toBe(120);
  });

  it('rejects a quantityDebited that is not greater than zero', () => {
    expect(
      () =>
        new StockMovementSnapshot({
          id: 'snapshot-1',
          saleId: 'sale-1',
          materialId: 'material-1',
          quantityDebited: 0,
          createdAt: new Date('2026-01-01T00:00:00Z'),
        }),
    ).toThrow(InvalidSaleError);
  });
});
