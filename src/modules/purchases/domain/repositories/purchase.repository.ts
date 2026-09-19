import type { Purchase } from '../purchase.entity';
import type { PurchaseItem } from '../purchase-item.entity';

export const PURCHASE_REPOSITORY = Symbol('PURCHASE_REPOSITORY');

export interface PurchaseRepository {
  findById(id: string): Promise<Purchase | null>;
  /** Used to deduplicate NFC-e imports against the 44-digit access key. */
  findByAccessKey(accessKey: string): Promise<Purchase | null>;
  findAll(): Promise<Purchase[]>;
  save(purchase: Purchase): Promise<void>;
  delete(id: string): Promise<void>;
  findItemsByPurchaseId(purchaseId: string): Promise<PurchaseItem[]>;
  saveItems(items: PurchaseItem[]): Promise<void>;
}
