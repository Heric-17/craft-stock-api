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
  saveItems(items: SaleItem[]): Promise<void>;
  findStockMovementsBySaleId(saleId: string): Promise<StockMovementSnapshot[]>;
  saveStockMovements(snapshots: StockMovementSnapshot[]): Promise<void>;
}
