import { Money } from '../../../shared/domain/money/money';
import { InvalidSaleError } from './sale.error';
import { SaleItem } from './sale-item.entity';

function buildItem(overrides: Partial<ConstructorParameters<typeof SaleItem>[0]> = {}): SaleItem {
  return new SaleItem({
    id: 'item-1',
    saleId: 'sale-1',
    compositeProductId: 'product-1',
    materialId: null,
    quantity: 1,
    itemNameSnapshot: 'Bolo de cenoura',
    priceBasisAmount: Money.fromDecimalString('19.90'),
    priceBasisQuantity: 1,
    ...overrides,
  });
}

/** A loose-Material ("avulso") line: flour bought by the kilo, sold by the gram. */
function buildLooseFlourItem(
  overrides: Partial<ConstructorParameters<typeof SaleItem>[0]> = {},
): SaleItem {
  return buildItem({
    compositeProductId: null,
    materialId: 'material-1',
    itemNameSnapshot: 'Farinha de trigo',
    quantity: 120,
    priceBasisAmount: Money.fromDecimalString('28.00'),
    priceBasisQuantity: 1000,
    ...overrides,
  });
}

describe('SaleItem', () => {
  describe('lineTotal', () => {
    it('is priceBasisAmount times quantity for a CompositeProduct line', () => {
      const item = buildItem({
        quantity: 3,
        priceBasisAmount: Money.fromDecimalString('15.00'),
        priceBasisQuantity: 1,
      });

      expect(item.lineTotal.toDecimalString()).toBe('45.00');
    });

    it('charges exactly R$ 3,36 for 120 g of a 1 kg package costing R$ 28,00', () => {
      // The whole point of freezing the fraction: R$ 0,028 per gram does not
      // fit in whole cents, and a per-unit snapshot of R$ 0,03 would charge
      // R$ 3,60 for this line, 7% too much.
      expect(buildLooseFlourItem().lineTotal.toDecimalString()).toBe('3.36');
    });

    it('charges exactly R$ 5,04 for the same 120 g at a 50% margin', () => {
      // 28.00 x 1.5 = 42.00, the marked-up price of the whole package.
      const item = buildLooseFlourItem({ priceBasisAmount: Money.fromDecimalString('42.00') });

      expect(item.lineTotal.toDecimalString()).toBe('5.04');
    });

    it('returns the whole amount when a repeating unit price is sold in full', () => {
      // R$ 10,00 over 3 units is R$ 3,3333... each. Multiplying before
      // dividing gives the R$ 10,00 actually charged; rounding the unit price
      // first would give R$ 9,99 or R$ 10,02.
      const item = buildItem({
        quantity: 3,
        priceBasisAmount: Money.fromDecimalString('10.00'),
        priceBasisQuantity: 3,
      });

      expect(item.lineTotal.toDecimalString()).toBe('10.00');
    });
  });

  describe('unitPrice', () => {
    it('shows a sub-cent unit price with four places', () => {
      expect(buildLooseFlourItem().unitPrice).toBe('0.0280');
    });

    it('shows a whole-piece price with four places too', () => {
      expect(buildItem().unitPrice).toBe('19.9000');
    });
  });

  it('rejects referencing both a CompositeProduct and a Material', () => {
    expect(() => buildItem({ compositeProductId: 'product-1', materialId: 'material-1' })).toThrow(
      InvalidSaleError,
    );
  });

  it('rejects referencing neither a CompositeProduct nor a Material', () => {
    expect(() => buildItem({ compositeProductId: null, materialId: null })).toThrow(
      InvalidSaleError,
    );
  });

  it('rejects an empty itemNameSnapshot', () => {
    expect(() => buildItem({ itemNameSnapshot: '  ' })).toThrow(InvalidSaleError);
  });

  it('rejects a priceBasisQuantity of zero, which has no price to divide', () => {
    expect(() => buildItem({ priceBasisQuantity: 0 })).toThrow(InvalidSaleError);
  });

  it('rejects a negative priceBasisQuantity', () => {
    expect(() => buildItem({ priceBasisQuantity: -1 })).toThrow(InvalidSaleError);
  });

  it('rejects a negative priceBasisAmount', () => {
    expect(() => buildItem({ priceBasisAmount: Money.fromDecimalString('-1.00') })).toThrow(
      InvalidSaleError,
    );
  });

  it('accepts a priceBasisAmount of zero, which charges nothing', () => {
    expect(buildItem({ priceBasisAmount: Money.zero() }).lineTotal.isZero()).toBe(true);
  });

  describe('historical snapshot', () => {
    it('records the name and the price basis given at creation, exactly', () => {
      const item = buildItem();

      expect(item.itemNameSnapshot).toBe('Bolo de cenoura');
      expect(item.priceBasisAmount.toDecimalString()).toBe('19.90');
      expect(item.priceBasisQuantity).toBe(1);
    });

    it('is unaffected by the referenced CompositeProduct being renamed and repriced afterwards', () => {
      const item = buildItem();

      // Simulates the product catalog changing after the sale: a new read of
      // the CompositeProduct would now return a different name and price. The
      // already-created SaleItem holds no live reference to it, only the
      // frozen basis, so nothing in this entity could reflect that change
      // even if the caller tried.
      const currentCatalogName = 'Bolo de cenoura premium';
      const currentCatalogPrice = Money.fromDecimalString('29.90');

      expect(item.itemNameSnapshot).toBe('Bolo de cenoura');
      expect(item.itemNameSnapshot).not.toBe(currentCatalogName);
      expect(item.priceBasisAmount.equals(currentCatalogPrice)).toBe(false);
      expect(item.lineTotal.toDecimalString()).toBe('19.90');
    });

    it('is unaffected by the referenced Material getting more expensive afterwards', () => {
      const item = buildLooseFlourItem();

      // The Material's packageCost rising to R$ 35,00 — by invoice import or
      // by hand — reprices every future sale and nothing already sold.
      expect(item.priceBasisAmount.toDecimalString()).toBe('28.00');
      expect(item.priceBasisAmount.equals(Money.fromDecimalString('35.00'))).toBe(false);
      expect(item.lineTotal.toDecimalString()).toBe('3.36');
    });

    it('stays readable after the referenced CompositeProduct is discontinued', () => {
      const item = buildItem();

      // Discontinuing the product never touches this SaleItem: it has its
      // own copy of the data it needs.
      expect(item.itemNameSnapshot).toBe('Bolo de cenoura');
      expect(item.priceBasisAmount.toDecimalString()).toBe('19.90');
    });
  });

  describe('withQuantity', () => {
    it('replaces the quantity and preserves the whole price basis untouched', () => {
      const item = buildLooseFlourItem();

      const updated = item.withQuantity(250);

      expect(updated.quantity).toBe(250);
      expect(updated.itemNameSnapshot).toBe(item.itemNameSnapshot);
      expect(updated.priceBasisAmount.equals(item.priceBasisAmount)).toBe(true);
      expect(updated.priceBasisQuantity).toBe(item.priceBasisQuantity);
      // Only the derived total moves with the quantity.
      expect(updated.lineTotal.toDecimalString()).toBe('7.00');
      expect(item.lineTotal.toDecimalString()).toBe('3.36');
      expect(updated).not.toBe(item);
    });

    it('still enforces the quantity invariant', () => {
      expect(() => buildItem().withQuantity(0)).toThrow(InvalidSaleError);
    });
  });
});
