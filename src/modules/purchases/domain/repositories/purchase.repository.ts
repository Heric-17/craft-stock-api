import type { Purchase } from '../purchase.entity';

export const PURCHASE_REPOSITORY = Symbol('PURCHASE_REPOSITORY');

/**
 * The repository of the aggregate, and the only one there is.
 *
 * There is deliberately no `PurchaseItemRepository`: one would make it
 * possible to load a single line, change its classification and save it
 * again, which is exactly the path that would leave `allocatedDiscount`
 * attributed to a line that is no longer in the eligible group. Loading and
 * saving the whole `Purchase` is what makes that unreachable rather than
 * merely discouraged.
 */
export interface PurchaseRepository {
  /** Loads the purchase together with its lines — the aggregate is never partial. */
  findById(id: string): Promise<Purchase | null>;
  /** Used to deduplicate NFC-e imports against the 44-digit access key. */
  findByAccessKey(accessKey: string): Promise<Purchase | null>;
  findAll(): Promise<Purchase[]>;
  /** Persists the root and its lines in one go, removing lines that are gone. */
  save(purchase: Purchase): Promise<void>;
  delete(id: string): Promise<void>;
}
