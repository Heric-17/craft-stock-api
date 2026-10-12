import type { PageView } from '../../../../shared/application/pagination/page-view';
import type { ConsumptionUnit } from '../../../materials/domain/consumption-unit';
import type { PaymentStatus } from '../../domain/payment-status.enum';
import type { ProductionStatus } from '../../domain/production-status.enum';

/** Exactly one of compositeProductId / materialId must be set. */
export interface CreateSaleItemInput {
  compositeProductId?: string;
  materialId?: string;
  quantity: number;
  /**
   * Markup over the Material's `packageCost` in whole basis points (`5000` is
   * 50%), required for a
   * loose-Material line and rejected for a `CompositeProduct` one, which
   * carries its own margin. Zero sells at cost and has to be stated: see
   * `calculateLooseMaterialPriceBasis`.
   */
  marginBasisPoints?: number;
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
  limit: number;
  offset: number;
}

export type SalePageView = PageView<SaleView>;

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
  /**
   * Whole packages to buy to cover `shortage`, rounded up — a material is
   * bought in a closed package. Zero when nothing is missing; null when the
   * package data does not allow it (see `estimateIssue`).
   */
  packagesToBuy: number | null;
  /**
   * `packagesToBuy × packageCost`, two places. "0.00" when nothing is
   * missing. NULL — not zero — when it cannot be estimated.
   */
  estimatedCost: string | null;
  /** Set exactly when something is missing and the line could not be estimated. */
  estimateIssue: 'MISSING_PACKAGE_DATA' | null;
}

/**
 * The shopping list: its lines, and the estimate for the whole of it.
 *
 * `estimatedTotal` adds only the lines that could be estimated, so it is a
 * lower bound — and complete only while `unestimatedLineCount` is zero. The
 * client must say so when it is not, instead of presenting the total as whole.
 */
export interface ShoppingListView {
  lines: ShoppingListLineView[];
  estimatedTotal: string;
  unestimatedLineCount: number;
}

export interface SalesDatasetQueryInput {
  from: Date;
  to: Date;
}

/** Totals of one slice of sales, with the amount as a decimal string. */
export interface SalesTotalsView {
  saleCount: number;
  totalAmount: string;
}

export interface SalesByMonthView extends SalesTotalsView {
  /** `YYYY-MM`, in the business time zone (America/Sao_Paulo). */
  month: string;
}

export interface SalesByPaymentStatusView extends SalesTotalsView {
  paymentStatus: PaymentStatus;
}

export interface SalesByProductionStatusView extends SalesTotalsView {
  productionStatus: ProductionStatus;
}

export interface OpenSalesCellView extends SalesTotalsView {
  paymentStatus: PaymentStatus;
  productionStatus: ProductionStatus;
}

/**
 * The sales dataset as the panel receives it: cells by dimension, not
 * finished figures. `openItems` ignores the period on purpose — see
 * `SalesDataset`.
 */
export interface SalesDatasetView {
  from: Date;
  to: Date;
  byMonth: SalesByMonthView[];
  byPaymentStatus: SalesByPaymentStatusView[];
  byProductionStatus: SalesByProductionStatusView[];
  openItems: OpenSalesCellView[];
}
