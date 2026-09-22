import { Money } from '../../../shared/domain/money/money';
import { PurchaseItem, type PurchaseItemProps } from './purchase-item.entity';
import { InvalidPurchaseError } from './purchase.error';

const money = (value: string): Money => Money.fromDecimalString(value);

function build(overrides: Partial<PurchaseItemProps> = {}): PurchaseItem {
  return new PurchaseItem({
    id: 'item-1',
    purchaseId: 'purchase-1',
    code: '92342',
    description: 'Farinha de trigo 1kg',
    quantity: 2,
    unit: 'UND9',
    unitPrice: money('10.00'),
    grossValue: money('20.00'),
    allocatedDiscount: Money.zero(),
    isCompanyExpense: true,
    isStockMaterial: false,
    materialId: null,
    ...overrides,
  });
}

describe('PurchaseItem', () => {
  it('rejects a quantity that is not greater than zero', () => {
    expect(() => build({ quantity: 0 })).toThrow(InvalidPurchaseError);
    expect(() => build({ quantity: -1 })).toThrow(InvalidPurchaseError);
  });

  it('rejects a negative gross value or a negative attributed discount', () => {
    expect(() => build({ grossValue: money('-1.00') })).toThrow(InvalidPurchaseError);
    expect(() => build({ allocatedDiscount: money('-0.01') })).toThrow(InvalidPurchaseError);
  });

  /** A line never takes more discount than it is worth. */
  it('rejects an attributed discount larger than the line', () => {
    expect(() => build({ allocatedDiscount: money('20.01') })).toThrow(InvalidPurchaseError);
  });

  it('rejects being stock without also being a company expense', () => {
    expect(() =>
      build({ isStockMaterial: true, isCompanyExpense: false, materialId: 'm-1' }),
    ).toThrow(InvalidPurchaseError);
  });

  it('requires a materialId if and only if it is a stock line', () => {
    expect(() => build({ isStockMaterial: true, materialId: null })).toThrow(InvalidPurchaseError);
    expect(() => build({ isStockMaterial: false, materialId: 'm-1' })).toThrow(
      InvalidPurchaseError,
    );
  });

  describe('netValue', () => {
    /**
     * Derived on every read and never a column: it is always grossValue minus
     * allocatedDiscount, so storing it would be a third number to hold in
     * step with the other two.
     */
    it('is the gross value less the attributed discount', () => {
      expect(build({ allocatedDiscount: money('2.50') }).netValue.toDecimalString()).toBe('17.50');
    });

    it('equals the gross value when the note granted no discount', () => {
      expect(build().netValue.toDecimalString()).toBe('20.00');
    });
  });

  describe('packageCostBasis', () => {
    /**
     * Always from the gross side, in every allocation mode. A discount is a
     * one-off event, while packageCost answers what restocking costs next
     * time — pricing a product off a promotional price assumes the promotion
     * lasts.
     */
    it('comes from the gross value even when the line absorbed a discount', () => {
      const discounted = build({ allocatedDiscount: money('4.00') });

      expect(discounted.netValue.toDecimalString()).toBe('16.00');
      expect(discounted.packageCostBasis.toDecimalString()).toBe('10.00');
    });

    it('divides the gross value by the quantity bought', () => {
      expect(
        build({ quantity: 4, grossValue: money('37.96') }).packageCostBasis.toDecimalString(),
      ).toBe('9.49');
    });
  });

  describe('expenseValue', () => {
    it('is the net value for a company line', () => {
      expect(build({ allocatedDiscount: money('2.50') }).expenseValue.toDecimalString()).toBe(
        '17.50',
      );
    });

    /** The gross side never takes part in what the company spent. */
    it('is zero for a personal line', () => {
      expect(build({ isCompanyExpense: false }).expenseValue.toDecimalString()).toBe('0.00');
    });
  });

  /**
   * The structural guarantee: there is no setter for the classification or
   * the attributed discount, so a line cannot be moved between eligible
   * groups without going through `Purchase`, which reattributes.
   */
  it('exposes no setter for its classification or its attributed discount', () => {
    const item = build();
    const surface = [
      ...Object.getOwnPropertyNames(item),
      ...Object.getOwnPropertyNames(PurchaseItem.prototype),
    ];

    for (const forbidden of [
      'setIsCompanyExpense',
      'setIsStockMaterial',
      'setAllocatedDiscount',
      'withAllocatedDiscount',
      'withClassification',
    ]) {
      expect(surface).not.toContain(forbidden);
    }
  });

  it('round-trips through its own props', () => {
    const item = build({ allocatedDiscount: money('1.00') });
    const rebuilt = new PurchaseItem(item.toProps());

    expect(rebuilt.netValue.toDecimalString()).toBe(item.netValue.toDecimalString());
    expect(rebuilt.code).toBe('92342');
    expect(rebuilt.unit).toBe('UND9');
  });
});
