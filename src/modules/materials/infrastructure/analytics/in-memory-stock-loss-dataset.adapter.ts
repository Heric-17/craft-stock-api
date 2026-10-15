import type {
  StockLossDataset,
  StockLossDatasetPort,
  StockLossDatasetQuery,
} from '../../domain/ports/stock-loss-dataset.port';
import { buildStockLossDataset } from '../../domain/stock-loss-dataset';
import type { InMemoryMaterialRepository } from '../persistence/in-memory-material.repository';
import type { InMemoryStockAdjustmentRepository } from '../persistence/in-memory-stock-adjustment.repository';

/** In-memory `StockLossDatasetPort` for `application/` tests: reads what the in-memory repositories hold. */
export class InMemoryStockLossDatasetAdapter implements StockLossDatasetPort {
  constructor(
    private readonly adjustments: InMemoryStockAdjustmentRepository,
    private readonly materials: InMemoryMaterialRepository,
  ) {}

  async lossDataset(query: StockLossDatasetQuery): Promise<StockLossDataset> {
    const facts = [];

    for (const loss of this.adjustments.all()) {
      if (
        loss.kind !== 'MANUAL_LOSS' ||
        loss.createdAt < query.from ||
        loss.createdAt >= query.to ||
        this.adjustments.isReversed(loss.id)
      ) {
        continue;
      }

      const material = await this.materials.findById(loss.materialId);
      facts.push({ loss, materialName: material?.name ?? loss.materialId });
    }

    return buildStockLossDataset(query, facts);
  }
}
