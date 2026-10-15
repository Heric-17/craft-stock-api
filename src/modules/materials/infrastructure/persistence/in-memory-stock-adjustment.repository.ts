import type {
  StockAdjustmentHistoryPage,
  StockAdjustmentHistoryQuery,
  StockAdjustmentRepository,
  StockLossListQuery,
  StockLossPage,
} from '../../domain/repositories/stock-adjustment.repository';
import type { StockAdjustment } from '../../domain/stock-adjustment.entity';

/** In-memory `StockAdjustmentRepository` for `application/` tests. Never mocks Prisma. */
export class InMemoryStockAdjustmentRepository implements StockAdjustmentRepository {
  private readonly adjustments = new Map<string, StockAdjustment>();

  async findById(id: string): Promise<StockAdjustment | null> {
    return Promise.resolve(this.adjustments.get(id) ?? null);
  }

  async findReversalOf(adjustmentId: string): Promise<StockAdjustment | null> {
    return Promise.resolve(this.reversalOf(adjustmentId));
  }

  async save(adjustment: StockAdjustment): Promise<void> {
    this.adjustments.set(adjustment.id, adjustment);
    return Promise.resolve();
  }

  /** Same filters and same order as the Prisma one: newest first, ties broken on id. */
  async findHistoryPage(query: StockAdjustmentHistoryQuery): Promise<StockAdjustmentHistoryPage> {
    const matching = [...this.adjustments.values()]
      .filter(
        (adjustment) =>
          adjustment.materialId === query.materialId &&
          (query.kind === undefined || adjustment.kind === query.kind),
      )
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.id.localeCompare(a.id));

    return Promise.resolve({
      entries: matching.slice(query.offset, query.offset + query.limit).map((adjustment) => ({
        adjustment,
        reversedByAdjustmentId: this.reversalOf(adjustment.id)?.id ?? null,
      })),
      total: matching.length,
      limit: query.limit,
      offset: query.offset,
    });
  }

  /** Same filters and same order as the Prisma one: newest first, ties broken on id. */
  async findLossPage(query: StockLossListQuery): Promise<StockLossPage> {
    const matching = this.losses(query).sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.id.localeCompare(a.id),
    );

    return Promise.resolve({
      entries: matching.slice(query.offset, query.offset + query.limit).map((loss) => ({
        loss,
        reversedByAdjustmentId: this.reversalOf(loss.id)?.id ?? null,
      })),
      total: matching.length,
      limit: query.limit,
      offset: query.offset,
    });
  }

  /** Test seam, not part of `StockAdjustmentRepository`: every adjustment held. */
  all(): StockAdjustment[] {
    return [...this.adjustments.values()];
  }

  isReversed(adjustmentId: string): boolean {
    return this.reversalOf(adjustmentId) !== null;
  }

  private reversalOf(adjustmentId: string): StockAdjustment | null {
    return (
      [...this.adjustments.values()].find(
        (adjustment) => adjustment.reversedAdjustmentId === adjustmentId,
      ) ?? null
    );
  }

  private losses(query: StockLossListQuery): StockAdjustment[] {
    return [...this.adjustments.values()].filter(
      (adjustment) =>
        adjustment.kind === 'MANUAL_LOSS' &&
        (query.from === undefined || adjustment.createdAt >= query.from) &&
        (query.to === undefined || adjustment.createdAt < query.to) &&
        (query.materialId === undefined || adjustment.materialId === query.materialId) &&
        (query.reason === undefined || adjustment.reason === query.reason),
    );
  }
}
