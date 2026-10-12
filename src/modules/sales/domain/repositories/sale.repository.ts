import type { PaymentStatus } from '../payment-status.enum';
import type { ProductionStatus } from '../production-status.enum';
import type { Sale } from '../sale.entity';
import type { SaleItem } from '../sale-item.entity';
import type { StockMovementSnapshot } from '../stock-movement-snapshot.entity';

export const SALE_REPOSITORY = Symbol('SALE_REPOSITORY');

/** Filter and window of one page of the sales history. */
export interface SaleListQuery {
  paymentStatus?: PaymentStatus;
  productionStatus?: ProductionStatus;
  limit: number;
  offset: number;
}

/**
 * One page of sales, newest first, with the size of the whole filtered set
 * beside it. The filter is part of the query and not applied to the page
 * afterwards, which would leave `total` and the page boundaries describing a
 * set the caller did not ask for.
 */
export interface SalePage {
  sales: Sale[];
  total: number;
  limit: number;
  offset: number;
}

export interface SaleRepository {
  findById(id: string): Promise<Sale | null>;
  /**
   * One page of the history, newest first. Ties on `createdAt` are broken on
   * `id`, so two sales recorded at the same instant cannot swap places between
   * one page and the next and leave a row unreachable or repeated.
   */
  findPage(query: SaleListQuery): Promise<SalePage>;
  save(sale: Sale): Promise<void>;
  delete(id: string): Promise<void>;
  findItemsBySaleId(saleId: string): Promise<SaleItem[]>;
  /**
   * Upserts by id. Callers must never pass a `SaleItem` whose
   * `itemNameSnapshot`, `priceBasisAmount` or `priceBasisQuantity` differ
   * from what was originally created. The only in-place edit the domain
   * entity exposes is `SaleItem.withQuantity`, which preserves all three;
   * changing the referenced entity means deleting this line and creating a
   * new one instead.
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
