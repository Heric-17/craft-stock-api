import type { ConsumptionUnit } from '../../../materials/domain/consumption-unit';
import type { PaymentStatus } from '../../domain/payment-status.enum';
import type { ProductionStatus } from '../../domain/production-status.enum';

/** Exactly one of compositeProductId / materialId must be set. */
export interface CreateSaleItemInput {
  compositeProductId?: string;
  materialId?: string;
  quantity: number;
  /**
   * Percentage markup over the Material's `packageCost`, required for a
   * loose-Material line and rejected for a `CompositeProduct` one, which
   * carries its own margin. Zero sells at cost and has to be stated: see
   * `calculateLooseMaterialPriceBasis`.
   */
  marginPercent?: number;
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

/**
 * Read model for a `SaleItem`. Both `unitPrice` and `lineTotal` are derived
 * from the frozen price basis at read time, never persisted.
 *
 * Every monetary field is a decimal string, never a number: `priceBasisAmount`
 * and `lineTotal` with two places, `unitPrice` with four, because the price of
 * one gram or one millilitre is a fraction of a cent. Four places is for
 * display only — the client shows `unitPrice`, it does not compute with it.
 */
export interface SaleItemView {
  id: string;
  compositeProductId: string | null;
  materialId: string | null;
  quantity: number;
  itemNameSnapshot: string;
  priceBasisAmount: string;
  priceBasisQuantity: number;
  unitPrice: string;
  lineTotal: string;
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
 * dataset the "lista de compras" screen derives its display from. The
 * backend exposes a dataset per dimension here, not a ready-made metric.
 */
export interface ShoppingListLineView {
  materialId: string;
  materialName: string;
  /** All three quantities are in the Material's `consumptionUnit`. */
  needed: number;
  stockQuantity: number;
  shortage: number;
  consumptionUnit: ConsumptionUnit;
  /** How `consumptionUnit` is written: `g`, `ml`, `cm`, `un`. */
  consumptionUnitSymbol: string;
}
