import { Money } from '../../../shared/domain/money/money';
import { InvalidSaleError } from './sale.error';
import { SaleItem } from './sale-item.entity';

describe('SaleItem', () => {
  it('computes the subtotal as unitPrice times quantity', () => {
    const item = new SaleItem({
      id: 'item-1',
      saleId: 'sale-1',
      compositeProductId: 'product-1',
      materialId: null,
      quantity: 3,
      unitPrice: Money.fromDecimalString('15.00'),
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
          unitPrice: Money.fromDecimalString('10.00'),
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
          unitPrice: Money.fromDecimalString('10.00'),
        }),
    ).toThrow(InvalidSaleError);
  });
});
