import type { Money } from '../../../../shared/domain/money/money';

export const MATERIAL_INVENTORY_SUMMARY_PORT = Symbol('MATERIAL_INVENTORY_SUMMARY_PORT');

export interface InventorySummaryQuery {
  /** Active Materials only by default, as everywhere else Materials are listed. */
  includeDiscontinued?: boolean;
}

export interface InventorySummary {
  /** Active Materials, or every Material when discontinued ones are included. */
  materialCount: number;
  /** Materials whose stock is at or below their minimum alert. */
  belowMinimumCount: number;
  /**
   * The sum of every Material's `stockValue`, each rounded to the cent before
   * it is added — see `summarizeInventory`.
   */
  totalStockValue: Money;
}

/**
 * The inventory summary, as a finished figure and not a dataset by dimension.
 *
 * This is the documented exception to the rule that the backend exposes
 * aggregates by dimension and lets the client derive the metrics. The value of
 * the stock is a sum over EVERY Material, and a page of the list is not every
 * Material: the client cannot derive it from what it has loaded, and loading
 * everything to add it up would put the rounding policy — each Material's
 * value rounded to the cent before the sum — in the client, where it would
 * have to be reimplemented and kept in step. A dataset by dimension would be
 * one row per Material, which is the whole list under another name. It stays
 * one operation, returning three numbers, so it does not grow into a method
 * per metric.
 */
export interface MaterialInventorySummaryPort {
  summary(query?: InventorySummaryQuery): Promise<InventorySummary>;
}
