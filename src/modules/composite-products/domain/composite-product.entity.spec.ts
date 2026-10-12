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
    imageKey: null,
    fixedOperationalCost: Money.fromDecimalString('2.50'),
    profitMarginBasisPoints: 3500,
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

  it('rejects a negative profitMarginBasisPoints', () => {
    expect(() => build({ profitMarginBasisPoints: -100 })).toThrow(InvalidCompositeProductError);
  });

  it('rejects a margin that is not a whole number of basis points', () => {
    expect(() => build({ profitMarginBasisPoints: 33.33 })).toThrow(InvalidCompositeProductError);
    expect(() => build({ profitMarginBasisPoints: Number.NaN })).toThrow(
      InvalidCompositeProductError,
    );
  });

  it('accepts the largest margin the column holds, 999,99%, and rejects one more basis point', () => {
    expect(build({ profitMarginBasisPoints: 99_999 }).profitMarginBasisPoints).toBe(99_999);
    expect(() => build({ profitMarginBasisPoints: 100_000 })).toThrow(InvalidCompositeProductError);
  });

  describe('update', () => {
    it('applies changes on top of the current state, immutably', () => {
      const product = build({ profitMarginBasisPoints: 3500 });
      const updatedAt = new Date('2026-02-01T00:00:00Z');

      const updated = product.update({ profitMarginBasisPoints: 4000 }, updatedAt);

      expect(updated).not.toBe(product);
      expect(updated.profitMarginBasisPoints).toBe(4000);
      expect(updated.updatedAt).toEqual(updatedAt);
      expect(product.profitMarginBasisPoints).toBe(3500);
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
