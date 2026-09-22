import { Money } from '../../../shared/domain/money/money';

/**
 * One `BillOfMaterials` line, reduced to what pricing needs.
 *
 * It carries the Material's `packageCost` and `packageQuantity` rather than a
 * ready-made per-unit cost, and that is the point: a per-unit cost is a
 * `Money`, a `Money` holds whole cents, and most consumption units cost less
 * than a cent. Handing this function an already-rounded figure is what turns
 * R$ 3,36 into R$ 3,60.
 */
export interface MaterialsCostLine {
  /** How much of the Material one produced unit consumes. */
  quantity: number;
  /** Cost of the whole purchased package. */
  packageCost: Money;
  /** How much the purchased package holds, in consumption units. */
  packageQuantity: number;
}

/**
 * What one `BillOfMaterials` line costs:
 * `packageCost × quantity ÷ packageQuantity`.
 *
 * Multiplied before divided, with a single rounding at the end. Dividing
 * first would force the per-unit cost into whole cents before it is ever
 * multiplied, and that rounding does not stay small: a 1 kg bag of flour at
 * R$ 28,00 is R$ 0,028 per gram, which becomes R$ 0,03, and the 120 g a
 * recipe uses then costs R$ 3,60 instead of R$ 3,36. Seven per cent, on
 * every line with a fractional ingredient, with nothing to show for it.
 */
export function calculateBomItemCost(
  packageCost: Money,
  quantity: number,
  packageQuantity: number,
): Money {
  return packageCost.scaled(quantity, packageQuantity);
}

/**
 * `materialsCost = Σ lineCost`. Zero for an empty `BillOfMaterials`.
 *
 * Each line is rounded to the cent and the rounded lines are summed, rather
 * than summing exactly and rounding once at the end. That is deliberate: the
 * line costs are shown to the user next to the total, and a total that does
 * not equal the lines above it reads as a bug every time. The rounding that
 * mattered — the one on the per-unit cost — is already gone.
 */
export function calculateMaterialsCost(lines: readonly MaterialsCostLine[]): Money {
  return lines.reduce(
    (total, line) =>
      total.plus(calculateBomItemCost(line.packageCost, line.quantity, line.packageQuantity)),
    Money.zero(),
  );
}

/** `totalCost = materialsCost + fixedOperationalCost`. */
export function calculateTotalCost(materialsCost: Money, fixedOperationalCost: Money): Money {
  return materialsCost.plus(fixedOperationalCost);
}

/** `suggestedPrice = totalCost × (1 + profitMargin / 100)`. `profitMargin` is a percentage, e.g. `35` for 35%. */
export function calculateSuggestedPrice(totalCost: Money, profitMargin: number): Money {
  return totalCost.times(1 + profitMargin / 100);
}

/** `finalPrice = manualPrice ?? suggestedPrice`. */
export function calculateFinalPrice(suggestedPrice: Money, manualPrice: Money | null): Money {
  return manualPrice ?? suggestedPrice;
}
