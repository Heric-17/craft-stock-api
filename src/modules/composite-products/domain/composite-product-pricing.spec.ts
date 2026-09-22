import { Money } from '../../../shared/domain/money/money';
import {
  calculateFinalPrice,
  calculateMaterialsCost,
  calculateSuggestedPrice,
  calculateTotalCost,
} from './composite-product-pricing';

describe('calculateMaterialsCost', () => {
  it('computes the cost of a single-Material recipe', () => {
    const cost = calculateMaterialsCost([
      { quantity: 120, packageCost: Money.fromDecimalString('20.00'), packageQuantity: 1000 },
    ]);

    expect(cost.toDecimalString()).toBe('2.40');
  });

  it('sums the cost across multiple Materials', () => {
    const cost = calculateMaterialsCost([
      { quantity: 120, packageCost: Money.fromDecimalString('20.00'), packageQuantity: 1000 },
      { quantity: 60, packageCost: Money.fromDecimalString('30.00'), packageQuantity: 1000 },
      { quantity: 2, packageCost: Money.fromDecimalString('1.00'), packageQuantity: 1 },
    ]);

    expect(cost.toDecimalString()).toBe('6.20');
  });

  it('is zero for a recipe with no items', () => {
    expect(calculateMaterialsCost([]).isZero()).toBe(true);
  });
});

describe('calculateTotalCost', () => {
  it('adds the fixed operational cost on top of the materials cost', () => {
    const total = calculateTotalCost(
      Money.fromDecimalString('5.60'),
      Money.fromDecimalString('2.50'),
    );

    expect(total.toDecimalString()).toBe('8.10');
  });
});

describe('calculateSuggestedPrice', () => {
  it('applies the profit margin on top of the total cost', () => {
    const suggested = calculateSuggestedPrice(Money.fromDecimalString('10.00'), 35);

    expect(suggested.toDecimalString()).toBe('13.50');
  });

  it('equals the total cost when the margin is zero', () => {
    const suggested = calculateSuggestedPrice(Money.fromDecimalString('10.00'), 0);

    expect(suggested.toDecimalString()).toBe('10.00');
  });
});

describe('calculateFinalPrice', () => {
  it('uses the suggested price when no manualPrice is set', () => {
    const finalPrice = calculateFinalPrice(Money.fromDecimalString('13.50'), null);

    expect(finalPrice.toDecimalString()).toBe('13.50');
  });

  it('lets manualPrice override the suggested price', () => {
    const finalPrice = calculateFinalPrice(
      Money.fromDecimalString('13.50'),
      Money.fromDecimalString('12.00'),
    );

    expect(finalPrice.toDecimalString()).toBe('12.00');
  });
});
