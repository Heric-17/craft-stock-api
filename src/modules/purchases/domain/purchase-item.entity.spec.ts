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
    grossValue: Money.fromDecimalString('20.00'),
    netValue: Money.fromDecimalString('20.00'),
    isCompanyExpense: true,
    isStockMaterial: true,
    materialId: 'material-1',
    ...overrides,
  });
}

describe('PurchaseItem', () => {
  it('derives the packageCost basis from the gross value, not from what was paid', () => {
    const item = build({
      grossValue: Money.fromDecimalString('20.00'),
      netValue: Money.fromDecimalString('14.00'),
    });

    expect(item.packageCostBasis.toDecimalString()).toBe('10.00');
  });

  it('keeps the same packageCost basis whatever discount the line absorbed', () => {
    const full = build({ netValue: Money.fromDecimalString('20.00') });
    const discounted = build({ netValue: Money.fromDecimalString('0.01') });

    expect(discounted.packageCostBasis.toDecimalString()).toBe(
      full.packageCostBasis.toDecimalString(),
    );
  });

  it('reports the discount the line absorbed as the gap between the two sides', () => {
    const item = build({
      grossValue: Money.fromDecimalString('20.00'),
      netValue: Money.fromDecimalString('17.50'),
    });

    expect(item.discountValue.toDecimalString()).toBe('2.50');
  });

  it('contributes what was paid, not full price, to the company expense', () => {
    const item = build({ netValue: Money.fromDecimalString('17.50') });

    expect(item.expenseValue.toDecimalString()).toBe('17.50');
  });

  it('contributes nothing to the company expense when the line is not one', () => {
    const item = build({ isCompanyExpense: false, isStockMaterial: false, materialId: null });

    expect(item.expenseValue.toDecimalString()).toBe('0.00');
  });

  it('allows a company expense that is not a stock Material, with no materialId', () => {
    const item = build({ isCompanyExpense: true, isStockMaterial: false, materialId: null });

    expect(item.materialId).toBeNull();
  });

  it('rejects a netValue above the grossValue', () => {
    expect(() => build({ netValue: Money.fromDecimalString('20.01') })).toThrow(
      InvalidPurchaseError,
    );
  });

  it('rejects a negative value on either side', () => {
    expect(() => build({ netValue: Money.fromDecimalString('-0.01') })).toThrow(
      InvalidPurchaseError,
    );
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
