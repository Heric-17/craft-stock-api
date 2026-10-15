import type {
  StockLossListQuery,
  StockLossPage,
  StockLossRepository,
} from '../../domain/repositories/stock-loss.repository';
import type { StockLoss } from '../../domain/stock-loss.entity';

/** In-memory `StockLossRepository` for `application/` tests. Never mocks Prisma. */
export class InMemoryStockLossRepository implements StockLossRepository {
  private readonly losses = new Map<string, StockLoss>();

  async findById(id: string): Promise<StockLoss | null> {
    return Promise.resolve(this.losses.get(id) ?? null);
  }

  async save(loss: StockLoss): Promise<void> {
    this.losses.set(loss.id, loss);
    return Promise.resolve();
  }

  async delete(id: string): Promise<void> {
    this.losses.delete(id);
    return Promise.resolve();
  }

  /** Same filters and same order as the Prisma one: newest first, ties broken on id. */
  async findPage(query: StockLossListQuery): Promise<StockLossPage> {
    const matching = this.all()
      .filter(
        (loss) =>
          (query.from === undefined || loss.createdAt >= query.from) &&
          (query.to === undefined || loss.createdAt < query.to) &&
          (query.materialId === undefined || loss.materialId === query.materialId) &&
          (query.reason === undefined || loss.reason === query.reason),
      )
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.id.localeCompare(a.id));

    return Promise.resolve({
      losses: matching.slice(query.offset, query.offset + query.limit),
      total: matching.length,
      limit: query.limit,
      offset: query.offset,
    });
  }

  /** Test seam, not part of `StockLossRepository`: every loss held. */
  all(): StockLoss[] {
    return [...this.losses.values()];
  }
}
