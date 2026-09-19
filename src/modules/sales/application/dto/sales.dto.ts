import type { PaymentStatus } from '../../domain/payment-status.enum';
import type { ProductionStatus } from '../../domain/production-status.enum';

/** Exactly one of compositeProductId / materialId must be set. */
export interface CreateSaleItemInput {
  compositeProductId?: string;
  materialId?: string;
  quantity: number;
}

export interface CreateSaleInput {
  customerName: string;
  customerContact: string | null;
  paymentMethod: string;
  items: CreateSaleItemInput[];
}

export interface UpdateSaleDetailsInput {
  customerName?: string;
  customerContact?: string | null;
  paymentMethod?: string;
}

export interface SaleListFilter {
  paymentStatus?: PaymentStatus;
  productionStatus?: ProductionStatus;
}

/** Read model for a `SaleItem`. `subtotal` is derived from the snapshot at read time, never persisted — CLAUDE.md section 10. */
export interface SaleItemView {
  id: string;
  compositeProductId: string | null;
  materialId: string | null;
  quantity: number;
  itemNameSnapshot: string;
  unitPriceSnapshot: string;
  subtotal: string;
}

/** Read model for a `Sale`. `totalAmount` is derived from its items' snapshots at read time, never persisted. */
export interface SaleView {
  id: string;
  customerName: string;
  customerContact: string | null;
  paymentMethod: string;
  paymentStatus: PaymentStatus;
  productionStatus: ProductionStatus;
  items: SaleItemView[];
  totalAmount: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * One Material's aggregated need across a set of selected Sales — the
 * dataset the "lista de compras" screen derives its display from (CLAUDE.md
 * section 7: the backend exposes a dataset per dimension, not a ready-made
 * metric).
 */
export interface ShoppingListLineView {
  materialId: string;
  materialName: string;
  needed: number;
  stockQuantity: number;
  shortage: number;
}
