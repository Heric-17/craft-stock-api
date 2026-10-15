import type {
  StockLossDataset,
  StockLossDatasetPort,
  StockLossDatasetQuery,
} from '../../domain/ports/stock-loss-dataset.port';
import { buildStockLossDataset } from '../../domain/stock-loss-dataset';
import type { InMemoryMaterialRepository } from '../persistence/in-memory-material.repository';
import type { InMemoryStockLossRepository } from '../persistence/in-memory-stock-loss.repository';

/** In-memory `StockLossDatasetPort` for `application/` tests: reads what the in-memory repositories hold. */
export class InMemoryStockLossDatasetAdapter implements StockLossDatasetPort {
  constructor(
    private readonly losses: InMemoryStockLossRepository,
    private readonly materials: InMemoryMaterialRepository,
  ) {}

  async lossDataset(query: StockLossDatasetQuery): Promise<StockLossDataset> {
    const facts = [];

    for (const loss of this.losses.all()) {
      if (loss.createdAt < query.from || loss.createdAt >= query.to) {
        continue;
      }

      const material = await this.materials.findById(loss.materialId);
      facts.push({ loss, materialName: material?.name ?? loss.materialId });
    }

    return buildStockLossDataset(query, facts);
  }
}
