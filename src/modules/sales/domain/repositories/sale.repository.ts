import type { Sale } from '../sale.entity';
import type { SaleItem } from '../sale-item.entity';
import type { StockMovementSnapshot } from '../stock-movement-snapshot.entity';

export const SALE_REPOSITORY = Symbol('SALE_REPOSITORY');

export interface SaleRepository {
  findById(id: string): Promise<Sale | null>;
  findAll(): Promise<Sale[]>;
  save(sale: Sale): Promise<void>;
  delete(id: string): Promise<void>;
  findItemsBySaleId(saleId: string): Promise<SaleItem[]>;
  /**
   * Upserts by id. Callers must never pass a `SaleItem` whose
   * `itemNameSnapshot`/`unitPriceSnapshot` differ from what was originally
   * created — see CLAUDE.md section 10. The only in-place edit the domain
   * entity exposes is `SaleItem.withQuantity`, which preserves both fields;
   * changing the referenced entity means deleting this line and creating a
   * new one instead.
   */
  saveItems(items: SaleItem[]): Promise<void>;
  findStockMovementsBySaleId(saleId: string): Promise<StockMovementSnapshot[]>;
  saveStockMovements(snapshots: StockMovementSnapshot[]): Promise<void>;
}
