import { Money } from '../../../shared/domain/money/money';
import { saleLineTotal, saleTotal } from './sale-line-total';

const line = (amount: string, quantity: number, priceBasisQuantity: number) => ({
  priceBasisAmount: Money.fromDecimalString(amount),
  quantity,
  priceBasisQuantity,
});

describe('saleLineTotal', () => {
  it('multiplies before dividing: 120 g of a 1 kg bag at 28.00 is 3.36, not 3.60', () => {
    expect(saleLineTotal(line('28.00', 120, 1000)).toDecimalString()).toBe('3.36');
  });

  it('rounds half away from zero on an exact tie', () => {
    // 0.25 x 1.14 = 0.285 exactly; a float computes 28.499999999999996 cents.
    expect(saleLineTotal(line('0.25', 1.14, 1)).toDecimalString()).toBe('0.29');
  });
});

describe('saleTotal', () => {
  /**
   * Three lines of R$ 1,00 over a basis of 3. Each is 0,33 on the screen, so
   * the sale is 0,99. Summing the exact fractions first gives 3 x 0.3333... =
   * 1,00, which is what a SUM over the decimal columns followed by a single
   * rounding would report: a total that disagrees with the lines above it.
   */
  const lines = [line('1.00', 1, 3), line('1.00', 1, 3), line('1.00', 1, 3)];

  it('sums the lines after rounding each one', () => {
    expect(saleTotal(lines).toDecimalString()).toBe('0.99');
  });

  it('differs from rounding the exact sum, which is why the order matters', () => {
    const exactSumRoundedOnce = Money.fromDecimalString('1.00').scaled(3, 3);

    expect(exactSumRoundedOnce.toDecimalString()).toBe('1.00');
    expect(saleTotal(lines).equals(exactSumRoundedOnce)).toBe(false);
  });

  it('is zero for a sale with no lines', () => {
    expect(saleTotal([]).isZero()).toBe(true);
  });
});
