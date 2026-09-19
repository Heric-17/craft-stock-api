import type { Sale } from '../../domain/sale.entity';
import type { SaleItem } from '../../domain/sale-item.entity';
import type { StockMovementSnapshot } from '../../domain/stock-movement-snapshot.entity';
import type { SaleRepository } from '../../domain/repositories/sale.repository';

/** In-memory `SaleRepository` for `application/` tests. Never mocks Prisma. */
export class InMemorySaleRepository implements SaleRepository {
  private readonly sales = new Map<string, Sale>();
  private readonly items = new Map<string, SaleItem>();
  private readonly stockMovements = new Map<string, StockMovementSnapshot>();

  async findById(id: string): Promise<Sale | null> {
    return Promise.resolve(this.sales.get(id) ?? null);
  }

  async findAll(): Promise<Sale[]> {
    return Promise.resolve([...this.sales.values()]);
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
}
