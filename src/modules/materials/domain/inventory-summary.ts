import { Money } from '../../../shared/domain/money/money';
import type { Material } from './material.entity';
import type { InventorySummary } from './ports/material-inventory-summary.port';

/**
 * Folds Materials into the inventory summary. Pure, and shared by both
 * adapters so the rule lives once.
 *
 * **The value is rounded per Material, before the sum.** Each Material's value
 * is `stockQuantity × packageCost ÷ packageQuantity` rounded to the cent
 * (`Material.stockValue`), and the total adds those cents up. The other way —
 * summing the exact fractions of a cent and rounding once at the end — would
 * give a different total whenever the fractions do not cancel, and the list of
 * Materials shows the value on each row: a total that disagrees with its own
 * rows by a few cents reads as a bug every time. Same choice, same reason, as
 * the total of a sale and the cost of a bill of materials.
 *
 * Whether to include discontinued Materials is decided by the caller, which
 * hands in the set to summarise.
 */
export function summarizeInventory(materials: readonly Material[]): InventorySummary {
  return {
    materialCount: materials.length,
    belowMinimumCount: materials.filter((material) => material.isBelowMinimumStock).length,
    totalStockValue: materials.reduce(
      (total, material) => total.plus(material.stockValue),
      Money.zero(),
    ),
  };
}
