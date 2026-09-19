import { Money } from '../../../shared/domain/money/money';

/** One `BillOfMaterials` line, reduced to what pricing needs: how much of the Material a unit consumes, and its current fractioned cost. */
export interface MaterialsCostLine {
  quantity: number;
  unitCost: Money;
}

/** `materialsCost = Σ (material.unitCost × bomItem.quantity)`. Zero for an empty `BillOfMaterials`. */
export function calculateMaterialsCost(lines: readonly MaterialsCostLine[]): Money {
  return lines.reduce(
    (total, line) => total.plus(line.unitCost.times(line.quantity)),
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
