import type { StockAdjustment } from '../stock-adjustment.entity';
import type { StockAdjustmentKind } from '../stock-adjustment-kind.enum';
import type { StockLossReason } from '../stock-loss-reason.enum';

export const STOCK_ADJUSTMENT_REPOSITORY = Symbol('STOCK_ADJUSTMENT_REPOSITORY');

export interface StockLossListQuery {
  /** Inclusive lower bound on when the loss was recorded. */
  from?: Date;
  /** Exclusive upper bound on when the loss was recorded. */
  to?: Date;
  materialId?: string;
  reason?: StockLossReason;
  limit: number;
  offset: number;
}

/** A loss, and the reversal that undid it, if one did. */
export interface StockLossEntry {
  loss: StockAdjustment;
  reversedByAdjustmentId: string | null;
}

/** One page of losses, with the size of the whole filtered set beside it. */
export interface StockLossPage {
  entries: StockLossEntry[];
  total: number;
  limit: number;
  offset: number;
}

export interface StockAdjustmentHistoryQuery {
  materialId: string;
  kind?: StockAdjustmentKind;
  limit: number;
  offset: number;
}

/** An adjustment, and the reversal that undid it, if one did. */
export interface StockAdjustmentEntry {
  adjustment: StockAdjustment;
  reversedByAdjustmentId: string | null;
}

/** One page of a Material's history, with the size of the whole filtered set beside it. */
export interface StockAdjustmentHistoryPage {
  entries: StockAdjustmentEntry[];
  total: number;
  limit: number;
  offset: number;
}

/** Append-only: there is no update and no delete. A mistake is corrected by saving a `REVERSAL`. */
export interface StockAdjustmentRepository {
  findById(id: string): Promise<StockAdjustment | null>;
  /** The reversal that undoes `adjustmentId`, if there is one. */
  findReversalOf(adjustmentId: string): Promise<StockAdjustment | null>;
  save(adjustment: StockAdjustment): Promise<void>;
  /** Every kind, for one Material, newest first; ties on the creation instant are broken on `id`. */
  findHistoryPage(query: StockAdjustmentHistoryQuery): Promise<StockAdjustmentHistoryPage>;
  /** `MANUAL_LOSS` entries only, newest first; ties on the creation instant are broken on `id`. */
  findLossPage(query: StockLossListQuery): Promise<StockLossPage>;
}
