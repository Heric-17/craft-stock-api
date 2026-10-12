import { Money } from '../../../shared/domain/money/money';
import type { SpendingByStockMaterial, SpendingTotals } from './ports/purchase-analytics.port';

/**
 * The line-kind dimension of the spending dataset, with both sides always
 * present and in a fixed order — stock materials first. A side nothing landed
 * on reports zeros, which is a result, so the client can always divide.
 */
export function buildStockMaterialDimension(
  stockMaterial: SpendingTotals | undefined,
  otherCompanyExpense: SpendingTotals | undefined,
): SpendingByStockMaterial[] {
  const empty: SpendingTotals = {
    netSpend: Money.zero(),
    discountTotal: Money.zero(),
    purchaseCount: 0,
  };

  return [
    { isStockMaterial: true, ...(stockMaterial ?? empty) },
    { isStockMaterial: false, ...(otherCompanyExpense ?? empty) },
  ];
}
