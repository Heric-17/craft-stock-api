import { Money } from '../../../shared/domain/money/money';

/** What a sale line's total depends on, and nothing else. */
export interface SaleLinePrice {
  priceBasisAmount: Money;
  quantity: number;
  priceBasisQuantity: number;
}

/**
 * `priceBasisAmount × quantity ÷ priceBasisQuantity` — derived on every read,
 * never persisted, same principle as `unitCost`.
 *
 * Multiplied before divided, rounded exactly once at the end. Dividing first
 * to get a price per unit and multiplying that would round a sub-cent figure
 * up to a whole cent before it is ever scaled, which is how 120 g of flour
 * turns into R$ 3,60 instead of R$ 3,36.
 *
 * The one definition of a line's total: `SaleItem.lineTotal`, the sale total
 * on the detail screen and every figure of the sales dataset all come from
 * here, which is what keeps them equal to the cent.
 */
export function saleLineTotal(line: SaleLinePrice): Money {
  return line.priceBasisAmount.scaled(line.quantity, line.priceBasisQuantity);
}

/**
 * The total of a sale: the sum of its lines' totals, each already rounded to
 * the cent.
 *
 * Summing the exact fractions and rounding once at the end would be a
 * different number, and the wrong one: three lines of R$ 1,00 ÷ 3 are 0,33
 * each on the screen and 0,99 together, while the exact sum is 1,00. The
 * total always equals the lines shown above it.
 */
export function saleTotal(lines: readonly SaleLinePrice[]): Money {
  return lines.reduce((total, line) => total.plus(saleLineTotal(line)), Money.zero());
}
