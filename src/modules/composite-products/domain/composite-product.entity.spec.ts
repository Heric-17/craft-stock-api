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
    discontinuedAt: null,
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

  describe('update', () => {
    it('applies changes on top of the current state, immutably', () => {
      const product = build({ profitMargin: 35 });
      const updatedAt = new Date('2026-02-01T00:00:00Z');

      const updated = product.update({ profitMargin: 40 }, updatedAt);

      expect(updated).not.toBe(product);
      expect(updated.profitMargin).toBe(40);
      expect(updated.updatedAt).toEqual(updatedAt);
      expect(product.profitMargin).toBe(35);
    });

    it('clears manualPrice when explicitly set to null', () => {
      const product = build({ manualPrice: Money.fromDecimalString('45.00') });

      const updated = product.update({ manualPrice: null }, new Date('2026-02-01T00:00:00Z'));

      expect(updated.manualPrice).toBeNull();
    });
  });

  describe('isActive / discontinue / reactivate', () => {
    it('is active by default (discontinuedAt is null)', () => {
      const product = build();

      expect(product.isActive).toBe(true);
    });

    it('discontinue sets discontinuedAt and flips isActive', () => {
      const product = build();
      const discontinuedAt = new Date('2026-02-01T00:00:00Z');

      const discontinued = product.discontinue(discontinuedAt);

      expect(discontinued.isActive).toBe(false);
      expect(discontinued.discontinuedAt).toEqual(discontinuedAt);
      expect(discontinued).not.toBe(product);
    });

    it('rejects discontinuing an already discontinued CompositeProduct', () => {
      const product = build({ discontinuedAt: new Date('2026-01-15T00:00:00Z') });

      expect(() => product.discontinue(new Date('2026-02-01T00:00:00Z'))).toThrow(
        InvalidCompositeProductError,
      );
    });

    it('reactivate clears discontinuedAt and flips isActive back', () => {
      const product = build({ discontinuedAt: new Date('2026-01-15T00:00:00Z') });
      const updatedAt = new Date('2026-02-01T00:00:00Z');

      const reactivated = product.reactivate(updatedAt);

      expect(reactivated.isActive).toBe(true);
      expect(reactivated.discontinuedAt).toBeNull();
      expect(reactivated.updatedAt).toEqual(updatedAt);
    });

    it('rejects reactivating a CompositeProduct that is already active', () => {
      const product = build();

      expect(() => product.reactivate(new Date('2026-02-01T00:00:00Z'))).toThrow(
        InvalidCompositeProductError,
      );
    });
  });
});
