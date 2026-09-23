import type { Purchase } from '../purchase.entity';

export const PURCHASE_REPOSITORY = Symbol('PURCHASE_REPOSITORY');

/** Filter and window of one page of the purchase history. */
export interface PurchaseListQuery {
  /** Inclusive lower bound on `purchaseDate`. */
  from?: Date;
  /** Exclusive upper bound on `purchaseDate`. */
  to?: Date;
  /** The shop, keyed exactly as the spending dataset reports it. */
  establishmentId?: string;
  limit: number;
  offset: number;
}

/**
 * One page of purchases, newest first.
 *
 * `total` is the size of the whole filtered set rather than of the page, so
 * the client can show how far the history goes. Paging is what a long list
 * needs; it is deliberately not what the spending panel uses, because a page
 * of rows cannot be folded into a period's totals.
 */
export interface PurchasePage {
  purchases: Purchase[];
  total: number;
  limit: number;
  offset: number;
}

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
  /** One page of the history, filtered by period and by establishment. */
  findPage(query: PurchaseListQuery): Promise<PurchasePage>;
  /** Persists the root and its lines in one go, removing lines that are gone. */
  save(purchase: Purchase): Promise<void>;
  delete(id: string): Promise<void>;
}
