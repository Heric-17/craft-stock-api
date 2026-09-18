import { Money } from '../../../shared/domain/money/money';
import { InvalidCompositeProductError } from './composite-product.error';
import { CompositeProduct } from './composite-product.entity';

function build(
  overrides: Partial<ConstructorParameters<typeof CompositeProduct>[0]> = {},
): CompositeProduct {
  return new CompositeProduct({
    id: 'product-1',
    name: 'Bolo de cenoura',
    description: null,
    imageUrl: null,
    fixedOperationalCost: Money.fromDecimalString('2.50'),
    profitMargin: 35,
    manualPrice: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  });
}

describe('CompositeProduct', () => {
  it('builds with a manualPrice overriding the suggested price', () => {
    const product = build({ manualPrice: Money.fromDecimalString('45.00') });

    expect(product.manualPrice?.toCents()).toBe(4500);
  });

  it('rejects an empty name', () => {
    expect(() => build({ name: ' ' })).toThrow(InvalidCompositeProductError);
  });

  it('rejects a negative profitMargin', () => {
    expect(() => build({ profitMargin: -1 })).toThrow(InvalidCompositeProductError);
  });
});
