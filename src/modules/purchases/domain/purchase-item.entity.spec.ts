import { Money } from '../../../shared/domain/money/money';
import { InvalidPurchaseError } from './purchase.error';
import { PurchaseItem } from './purchase-item.entity';

function build(
  overrides: Partial<ConstructorParameters<typeof PurchaseItem>[0]> = {},
): PurchaseItem {
  return new PurchaseItem({
    id: 'item-1',
    purchaseId: 'purchase-1',
    description: 'Farinha de trigo 1kg',
    quantity: 2,
    unitPrice: Money.fromDecimalString('10.00'),
    isCompanyExpense: true,
    isStockMaterial: true,
    materialId: 'material-1',
    ...overrides,
  });
}

describe('PurchaseItem', () => {
  it('computes totalPrice as unitPrice times quantity', () => {
    const item = build();

    expect(item.totalPrice.toCents()).toBe(2000);
  });

  it('allows a company expense that is not a stock Material, with no materialId', () => {
    const item = build({ isCompanyExpense: true, isStockMaterial: false, materialId: null });

    expect(item.materialId).toBeNull();
  });

  it('rejects a stock Material that is not a company expense', () => {
    expect(() =>
      build({ isCompanyExpense: false, isStockMaterial: true, materialId: 'material-1' }),
    ).toThrow(InvalidPurchaseError);
  });

  it('rejects a stock Material with no materialId', () => {
    expect(() => build({ isStockMaterial: true, materialId: null })).toThrow(InvalidPurchaseError);
  });

  it('rejects a materialId set when isStockMaterial is false', () => {
    expect(() => build({ isStockMaterial: false, materialId: 'material-1' })).toThrow(
      InvalidPurchaseError,
    );
  });
});
