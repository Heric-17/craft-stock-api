import { Money } from '../../../shared/domain/money/money';
import { InvalidSaleError } from './sale.error';
import { SaleItem } from './sale-item.entity';

describe('SaleItem', () => {
  it('computes the subtotal as unitPriceSnapshot times quantity', () => {
    const item = new SaleItem({
      id: 'item-1',
      saleId: 'sale-1',
      compositeProductId: 'product-1',
      materialId: null,
      quantity: 3,
      itemNameSnapshot: 'Bolo de cenoura',
      unitPriceSnapshot: Money.fromDecimalString('15.00'),
    });

    expect(item.subtotal.toCents()).toBe(4500);
  });

  it('rejects referencing both a CompositeProduct and a Material', () => {
    expect(
      () =>
        new SaleItem({
          id: 'item-1',
          saleId: 'sale-1',
          compositeProductId: 'product-1',
          materialId: 'material-1',
          quantity: 1,
          itemNameSnapshot: 'Bolo de cenoura',
          unitPriceSnapshot: Money.fromDecimalString('10.00'),
        }),
    ).toThrow(InvalidSaleError);
  });

  it('rejects referencing neither a CompositeProduct nor a Material', () => {
    expect(
      () =>
        new SaleItem({
          id: 'item-1',
          saleId: 'sale-1',
          compositeProductId: null,
          materialId: null,
          quantity: 1,
          itemNameSnapshot: 'Bolo de cenoura',
          unitPriceSnapshot: Money.fromDecimalString('10.00'),
        }),
    ).toThrow(InvalidSaleError);
  });

  it('rejects an empty itemNameSnapshot', () => {
    expect(
      () =>
        new SaleItem({
          id: 'item-1',
          saleId: 'sale-1',
          compositeProductId: 'product-1',
          materialId: null,
          quantity: 1,
          itemNameSnapshot: '  ',
          unitPriceSnapshot: Money.fromDecimalString('10.00'),
        }),
    ).toThrow(InvalidSaleError);
  });

  describe('historical snapshot', () => {
    function buildItem(
      overrides: Partial<ConstructorParameters<typeof SaleItem>[0]> = {},
    ): SaleItem {
      return new SaleItem({
        id: 'item-1',
        saleId: 'sale-1',
        compositeProductId: 'product-1',
        materialId: null,
        quantity: 1,
        itemNameSnapshot: 'Bolo de cenoura',
        unitPriceSnapshot: Money.fromDecimalString('19.90'),
        ...overrides,
      });
    }

    it('records the name and price given at creation, exactly', () => {
      const item = buildItem({
        itemNameSnapshot: 'Bolo de cenoura',
        unitPriceSnapshot: Money.fromDecimalString('19.90'),
      });

      expect(item.itemNameSnapshot).toBe('Bolo de cenoura');
      expect(item.unitPriceSnapshot.toDecimalString()).toBe('19.90');
    });

    it('is unaffected by the referenced CompositeProduct being renamed and repriced afterwards', () => {
      const item = buildItem({
        itemNameSnapshot: 'Bolo de cenoura',
        unitPriceSnapshot: Money.fromDecimalString('19.90'),
      });

      // Simulates the product catalog changing after the sale: a new read of
      // the CompositeProduct would now return a different name and price.
      // The already-created SaleItem holds no live reference to it, only the
      // frozen snapshot — nothing in this entity could reflect that change
      // even if the caller tried.
      const currentCatalogName = 'Bolo de cenoura premium';
      const currentCatalogPrice = Money.fromDecimalString('29.90');

      expect(item.itemNameSnapshot).toBe('Bolo de cenoura');
      expect(item.itemNameSnapshot).not.toBe(currentCatalogName);
      expect(item.unitPriceSnapshot.toDecimalString()).toBe('19.90');
      expect(item.unitPriceSnapshot.equals(currentCatalogPrice)).toBe(false);
    });

    it('stays readable after the referenced CompositeProduct is discontinued', () => {
      const item = buildItem({
        itemNameSnapshot: 'Bolo de cenoura',
        unitPriceSnapshot: Money.fromDecimalString('19.90'),
      });

      // Discontinuing the product never touches this SaleItem: it has its
      // own copy of the data it needs.
      expect(item.itemNameSnapshot).toBe('Bolo de cenoura');
      expect(item.unitPriceSnapshot.toDecimalString()).toBe('19.90');
    });
  });

  describe('withQuantity', () => {
    it('replaces the quantity and preserves the snapshot untouched', () => {
      const item = new SaleItem({
        id: 'item-1',
        saleId: 'sale-1',
        compositeProductId: 'product-1',
        materialId: null,
        quantity: 1,
        itemNameSnapshot: 'Bolo de cenoura',
        unitPriceSnapshot: Money.fromDecimalString('19.90'),
      });

      const updated = item.withQuantity(3);

      expect(updated.quantity).toBe(3);
      expect(updated.itemNameSnapshot).toBe(item.itemNameSnapshot);
      expect(updated.unitPriceSnapshot.equals(item.unitPriceSnapshot)).toBe(true);
      expect(updated).not.toBe(item);
    });

    it('still enforces the quantity invariant', () => {
      const item = new SaleItem({
        id: 'item-1',
        saleId: 'sale-1',
        compositeProductId: 'product-1',
        materialId: null,
        quantity: 1,
        itemNameSnapshot: 'Bolo de cenoura',
        unitPriceSnapshot: Money.fromDecimalString('19.90'),
      });

      expect(() => item.withQuantity(0)).toThrow(InvalidSaleError);
    });
  });
});
