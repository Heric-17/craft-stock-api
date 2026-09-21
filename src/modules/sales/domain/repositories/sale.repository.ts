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
   * created. The only in-place edit the domain entity exposes is
   * `SaleItem.withQuantity`, which preserves both fields; changing the
   * referenced entity means deleting this line and creating a new one
   * instead.
   */
  saveItems(items: SaleItem[]): Promise<void>;
  /** Removes a single line. The only way to change which entity a line references. */
  deleteItem(id: string): Promise<void>;
  findStockMovementsBySaleId(saleId: string): Promise<StockMovementSnapshot[]>;
  saveStockMovements(snapshots: StockMovementSnapshot[]): Promise<void>;
  /**
   * Clears the snapshots once their debit has been reversed (`ASSEMBLED` ->
   * `PENDING`), so a later re-assembly starts a fresh debit instead of being
   * mistaken for a duplicate of one already reversed.
   */
  deleteStockMovementsBySaleId(saleId: string): Promise<void>;
}
