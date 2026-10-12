import { applyMargin } from '../../../shared/domain/money/margin';
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

export interface CompositeProductPricingInput {
  /** The `BillOfMaterials` lines, each with its Material's current package data. */
  lines: readonly MaterialsCostLine[];
  fixedOperationalCost: Money;
  /** Whole basis points: 33,33% is `3333`, 100% is `10000`. */
  profitMarginBasisPoints: number;
  manualPrice: Money | null;
}

export interface CompositeProductPricing {
  materialsCost: Money;
  totalCost: Money;
  suggestedPrice: Money;
  finalPrice: Money;
}

/**
 * The pricing of a `CompositeProduct`, and the only place it is computed.
 * The client previews this figure while the recipe is still being edited, so
 * the order of operations below is a contract, not an implementation detail;
 * the cases in `composite-product-pricing.spec.ts` are what both sides must
 * reproduce to the cent.
 *
 *  1. `lineCost = packageCost × quantity ÷ packageQuantity`, per line,
 *     multiplied before divided and rounded once (half away from zero).
 *  2. `materialsCost = Σ lineCost` — the already rounded lines, summed.
 *  3. `totalCost = materialsCost + fixedOperationalCost`. Exact, in cents.
 *  4. `suggestedPrice = totalCost × (10 000 + profitMarginBasisPoints) ÷ 10 000`,
 *     rounded once (half away from zero). The margin is an integer, so no
 *     float is involved anywhere on the way.
 *  5. `finalPrice = manualPrice ?? suggestedPrice`.
 *
 * Rounding happens in steps 1 and 4 only. The margin is applied to the total,
 * never to each line: marking up per line rounds once per line, and the sum
 * of those roundings is not the rounding of the sum.
 */
export function calculateCompositeProductPricing(
  input: CompositeProductPricingInput,
): CompositeProductPricing {
  const materialsCost = calculateMaterialsCost(input.lines);
  const totalCost = materialsCost.plus(input.fixedOperationalCost);
  const suggestedPrice = applyMargin(totalCost, input.profitMarginBasisPoints);
  const finalPrice = input.manualPrice ?? suggestedPrice;

  return { materialsCost, totalCost, suggestedPrice, finalPrice };
}
