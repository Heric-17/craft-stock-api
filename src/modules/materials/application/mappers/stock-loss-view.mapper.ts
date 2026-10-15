import type { StockLossDataset, StockLossTotals } from '../../domain/ports/stock-loss-dataset.port';
import type { StockLoss } from '../../domain/stock-loss.entity';
import type {
  StockLossDatasetView,
  StockLossTotalsView,
  StockLossView,
} from '../dto/stock-losses.dto';

export class StockLossViewMapper {
  static toView(loss: StockLoss, materialName: string): StockLossView {
    return {
      id: loss.id,
      materialId: loss.materialId,
      materialName,
      quantity: loss.quantity,
      reason: loss.reason,
      observation: loss.observation,
      value: loss.value.toDecimalString(),
      costBasisAmount: loss.costBasisAmount.toDecimalString(),
      costBasisQuantity: loss.costBasisQuantity,
      createdAt: loss.createdAt,
    };
  }

  static toDatasetView(dataset: StockLossDataset): StockLossDatasetView {
    return {
      from: dataset.from,
      to: dataset.to,
      byMonth: dataset.byMonth.map((cell) => ({
        month: cell.month,
        ...StockLossViewMapper.totals(cell),
      })),
      byReason: dataset.byReason.map((cell) => ({
        reason: cell.reason,
        ...StockLossViewMapper.totals(cell),
      })),
      byMaterial: dataset.byMaterial.map((cell) => ({
        materialId: cell.materialId,
        materialName: cell.materialName,
        ...StockLossViewMapper.totals(cell),
      })),
    };
  }

  private static totals(cell: StockLossTotals): StockLossTotalsView {
    return { lossCount: cell.lossCount, lossValue: cell.lossValue.toDecimalString() };
  }
}
