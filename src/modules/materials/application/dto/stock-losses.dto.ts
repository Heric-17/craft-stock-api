import type { PageView } from '../../../../shared/application/pagination/page-view';
import type { ConsumptionUnit } from '../../domain/consumption-unit';
import type { StockLossReason } from '../../domain/stock-loss-reason.enum';

/** A loss typed in: how much was lost, and why. */
export interface RecordStockLossInput {
  /** Positive, in the Material's consumption unit. */
  quantity: number;
  reason: StockLossReason;
  observation?: string;
}

export interface StockLossView {
  id: string;
  materialId: string;
  materialName: string;
  /** The Material's unit as it is now, not frozen with the cost. */
  consumptionUnit: ConsumptionUnit;
  consumptionUnitSymbol: string;
  quantity: number;
  reason: StockLossReason;
  observation: string | null;
  /** What was lost, in money, at the cost of the moment; two places. */
  value: string;
  costBasisAmount: string;
  costBasisQuantity: number;
  createdAt: Date;
}

export interface StockLossResultView extends StockLossView {
  /** The Material's balance once the loss was taken out. */
  stockQuantityAfter: number;
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
