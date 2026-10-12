import type { Sale } from '../../domain/sale.entity';
import type { SaleItem } from '../../domain/sale-item.entity';
import type { StockMovementSnapshot } from '../../domain/stock-movement-snapshot.entity';
import type {
  SaleListQuery,
  SalePage,
  SaleRepository,
} from '../../domain/repositories/sale.repository';

/** In-memory `SaleRepository` for `application/` tests. Never mocks Prisma. */
export class InMemorySaleRepository implements SaleRepository {
  private readonly sales = new Map<string, Sale>();
  private readonly items = new Map<string, SaleItem>();
  private readonly stockMovements = new Map<string, StockMovementSnapshot>();

  async findById(id: string): Promise<Sale | null> {
    return Promise.resolve(this.sales.get(id) ?? null);
  }

  /** Same filters and same order as the Prisma one: newest first, ties broken on id. */
  async findPage(query: SaleListQuery): Promise<SalePage> {
    const matching = [...this.sales.values()]
      .filter(
        (sale) =>
          (query.paymentStatus === undefined || sale.paymentStatus === query.paymentStatus) &&
          (query.productionStatus === undefined ||
            sale.productionStatus === query.productionStatus),
      )
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.id.localeCompare(a.id));

    return Promise.resolve({
      sales: matching.slice(query.offset, query.offset + query.limit),
      total: matching.length,
      limit: query.limit,
      offset: query.offset,
    });
  }

  /**
   * Every sale held, in no particular order. Not part of `SaleRepository`: no
   * production path loads the whole history, and this exists only so the
   * in-memory analytics adapter can fold the sales it was handed in a test.
   */
  all(): Sale[] {
    return [...this.sales.values()];
  }

  async save(sale: Sale): Promise<void> {
    this.sales.set(sale.id, sale);
    return Promise.resolve();
  }

  async delete(id: string): Promise<void> {
    this.sales.delete(id);
    return Promise.resolve();
  }

  async findItemsBySaleId(saleId: string): Promise<SaleItem[]> {
    return Promise.resolve([...this.items.values()].filter((item) => item.saleId === saleId));
  }

  async saveItems(items: SaleItem[]): Promise<void> {
    for (const item of items) {
      this.items.set(item.id, item);
    }
    return Promise.resolve();
  }

  async deleteItem(id: string): Promise<void> {
    this.items.delete(id);
    return Promise.resolve();
  }

  async findStockMovementsBySaleId(saleId: string): Promise<StockMovementSnapshot[]> {
    return Promise.resolve(
      [...this.stockMovements.values()].filter((snapshot) => snapshot.saleId === saleId),
    );
  }

  async saveStockMovements(snapshots: StockMovementSnapshot[]): Promise<void> {
    for (const snapshot of snapshots) {
      this.stockMovements.set(snapshot.id, snapshot);
    }
    return Promise.resolve();
  }

  async deleteStockMovementsBySaleId(saleId: string): Promise<void> {
    for (const [id, snapshot] of this.stockMovements) {
      if (snapshot.saleId === saleId) {
        this.stockMovements.delete(id);
      }
    }
    return Promise.resolve();
  }
}
