import { Money } from '../../../shared/domain/money/money';
import { buildStockMaterialDimension } from './spending-by-stock-material';

describe('buildStockMaterialDimension', () => {
  const totals = {
    netSpend: Money.fromCents(7200),
    discountTotal: Money.fromCents(300),
    purchaseCount: 2,
  };

  it('always reports both sides, stock materials first', () => {
    const dimension = buildStockMaterialDimension(totals, undefined);

    expect(dimension.map((bucket) => bucket.isStockMaterial)).toEqual([true, false]);
    expect(dimension[0].netSpend.toCents()).toBe(7200);
  });

  it('reports a side with nothing on it as zeros, not as missing', () => {
    const [, other] = buildStockMaterialDimension(totals, undefined);

    expect(other.netSpend.isZero()).toBe(true);
    expect(other.discountTotal.isZero()).toBe(true);
    expect(other.purchaseCount).toBe(0);
  });

  it('is two zero buckets for an empty period', () => {
    const dimension = buildStockMaterialDimension(undefined, undefined);

    expect(
      dimension.every((bucket) => bucket.netSpend.isZero() && bucket.purchaseCount === 0),
    ).toBe(true);
  });
});
