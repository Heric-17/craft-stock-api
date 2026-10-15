import type { StockLossDataset, StockLossTotals } from '../../domain/ports/stock-loss-dataset.port';
import type { StockAdjustment } from '../../domain/stock-adjustment.entity';
import type { StockLossReason } from '../../domain/stock-loss-reason.enum';
import type {
  StockAdjustmentHistoryItemView,
  StockAdjustmentView,
  StockLossDatasetView,
  StockLossTotalsView,
  StockLossView,
} from '../dto/stock-adjustments.dto';

export class StockAdjustmentViewMapper {
  static toView(adjustment: StockAdjustment): StockAdjustmentView {
    return {
      id: adjustment.id,
      materialId: adjustment.materialId,
      kind: adjustment.kind,
      quantityDelta: adjustment.quantityDelta,
      reason: adjustment.reason,
      observation: adjustment.observation,
      value: adjustment.value.toDecimalString(),
      costBasisAmount: adjustment.costBasisAmount.toDecimalString(),
      costBasisQuantity: adjustment.costBasisQuantity,
      reversedAdjustmentId: adjustment.reversedAdjustmentId,
      createdAt: adjustment.createdAt,
    };
  }

  static toHistoryItemView(
    adjustment: StockAdjustment,
    reversedByAdjustmentId: string | null,
  ): StockAdjustmentHistoryItemView {
    return { ...StockAdjustmentViewMapper.toView(adjustment), reversedByAdjustmentId };
  }

  static toLossView(
    loss: StockAdjustment,
    materialName: string,
    reversedByAdjustmentId: string | null,
  ): StockLossView {
    return {
      id: loss.id,
      materialId: loss.materialId,
      materialName,
      quantityDelta: loss.quantityDelta,
      reason: loss.reason as StockLossReason,
      observation: loss.observation,
      value: loss.value.toDecimalString(),
      costBasisAmount: loss.costBasisAmount.toDecimalString(),
      costBasisQuantity: loss.costBasisQuantity,
      createdAt: loss.createdAt,
      reversedByAdjustmentId,
    };
  }

  static toDatasetView(dataset: StockLossDataset): StockLossDatasetView {
    return {
      from: dataset.from,
      to: dataset.to,
      byMonth: dataset.byMonth.map((cell) => ({
        month: cell.month,
        ...StockAdjustmentViewMapper.totals(cell),
      })),
      byReason: dataset.byReason.map((cell) => ({
        reason: cell.reason,
        ...StockAdjustmentViewMapper.totals(cell),
      })),
      byMaterial: dataset.byMaterial.map((cell) => ({
        materialId: cell.materialId,
        materialName: cell.materialName,
        ...StockAdjustmentViewMapper.totals(cell),
      })),
    };
  }

  private static totals(cell: StockLossTotals): StockLossTotalsView {
    return { lossCount: cell.lossCount, lossValue: cell.lossValue.toDecimalString() };
  }
}
