import type { PageView } from '../../../../shared/application/pagination/page-view';
import type { StockAdjustmentKind } from '../../domain/stock-adjustment-kind.enum';
import type { StockLossReason } from '../../domain/stock-loss-reason.enum';

/** A loss typed in: how much was lost, and why. */
export interface RecordStockLossInput {
  kind: 'MANUAL_LOSS';
  /** Positive: the amount lost, in the Material's consumption unit. */
  quantity: number;
  reason: StockLossReason;
  observation?: string;
}

/** The undoing of an earlier entry. */
export interface ReverseStockAdjustmentInput {
  kind: 'REVERSAL';
  reversedAdjustmentId: string;
  observation?: string;
}

export type RecordStockAdjustmentInput = RecordStockLossInput | ReverseStockAdjustmentInput;

/** One manual change to a Material's stock. `value` is derived from the frozen cost. */
export interface StockAdjustmentView {
  id: string;
  materialId: string;
  kind: StockAdjustmentKind;
  /** Signed: negative took stock out. */
  quantityDelta: number;
  reason: StockLossReason | null;
  observation: string | null;
  /** Always positive; two places. */
  value: string;
  costBasisAmount: string;
  costBasisQuantity: number;
  reversedAdjustmentId: string | null;
  createdAt: Date;
}

export interface StockAdjustmentResultView extends StockAdjustmentView {
  stockQuantityAfter: number;
}

export interface StockAdjustmentHistoryItemView extends StockAdjustmentView {
  /** The reversal that undid this entry, or null while it stands. */
  reversedByAdjustmentId: string | null;
}

export type StockAdjustmentHistoryPageView = PageView<StockAdjustmentHistoryItemView>;

export interface StockAdjustmentHistoryInput {
  materialId: string;
  kind?: StockAdjustmentKind;
  limit: number;
  offset: number;
}

export interface StockLossView {
  id: string;
  materialId: string;
  materialName: string;
  /** Negative: stock taken out. */
  quantityDelta: number;
  reason: StockLossReason;
  observation: string | null;
  value: string;
  costBasisAmount: string;
  costBasisQuantity: number;
  createdAt: Date;
  /** The reversal that undid this loss, or null while it stands. */
  reversedByAdjustmentId: string | null;
}

export type StockLossPageView = PageView<StockLossView>;

export interface StockLossListInput {
  from?: Date;
  to?: Date;
  materialId?: string;
  reason?: StockLossReason;
  limit: number;
  offset: number;
}

export interface StockLossDatasetQueryInput {
  from: Date;
  to: Date;
}

export interface StockLossTotalsView {
  lossCount: number;
  lossValue: string;
}

export interface StockLossByMonthView extends StockLossTotalsView {
  month: string;
}

export interface StockLossByReasonView extends StockLossTotalsView {
  reason: StockLossReason;
}

export interface StockLossByMaterialView extends StockLossTotalsView {
  materialId: string;
  materialName: string;
}

export interface StockLossDatasetView {
  from: Date;
  to: Date;
  byMonth: StockLossByMonthView[];
  byReason: StockLossByReasonView[];
  byMaterial: StockLossByMaterialView[];
}
