import type { Money } from '../../../../shared/domain/money/money';
import type { StockLossReason } from '../stock-loss-reason.enum';

export const STOCK_LOSS_DATASET_PORT = Symbol('STOCK_LOSS_DATASET_PORT');

export interface StockLossDatasetQuery {
  /** Inclusive lower bound, on the instant the loss was recorded. */
  from: Date;
  /** Exclusive upper bound. */
  to: Date;
}

export interface StockLossTotals {
  lossCount: number;
  /** The sum of each loss's value, rounded per loss. */
  lossValue: Money;
}

export interface StockLossByMonth extends StockLossTotals {
  /** `YYYY-MM`, in the business time zone. */
  month: string;
}

export interface StockLossByReason extends StockLossTotals {
  reason: StockLossReason;
}

export interface StockLossByMaterial extends StockLossTotals {
  materialId: string;
  materialName: string;
}

/**
 * Losses recorded in `[from, to)`, aggregated by dimension. Every month of the
 * range and every reason is present, zeros included; `byMaterial` lists only
 * the materials that have losses.
 */
export interface StockLossDataset {
  from: Date;
  to: Date;
  byMonth: StockLossByMonth[];
  byReason: StockLossByReason[];
  byMaterial: StockLossByMaterial[];
}

export interface StockLossDatasetPort {
  lossDataset(query: StockLossDatasetQuery): Promise<StockLossDataset>;
}
