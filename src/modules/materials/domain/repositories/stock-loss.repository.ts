import type { StockLoss } from '../stock-loss.entity';
import type { StockLossReason } from '../stock-loss-reason.enum';

export const STOCK_LOSS_REPOSITORY = Symbol('STOCK_LOSS_REPOSITORY');

export interface StockLossListQuery {
  /** Inclusive lower bound on when the loss was recorded. */
  from?: Date;
  /** Exclusive upper bound on when the loss was recorded. */
  to?: Date;
  materialId?: string;
  reason?: StockLossReason;
  limit: number;
  offset: number;
}

/** One page of losses, with the size of the whole filtered set beside it. */
export interface StockLossPage {
  losses: StockLoss[];
  total: number;
  limit: number;
  offset: number;
}

/** Append-only: there is no update and no delete. */
export interface StockLossRepository {
  save(loss: StockLoss): Promise<void>;
  /** Newest first; ties on the creation instant are broken on `id`. */
  findPage(query: StockLossListQuery): Promise<StockLossPage>;
}
