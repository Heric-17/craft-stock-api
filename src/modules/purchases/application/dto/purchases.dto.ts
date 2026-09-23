import type { DiscountAllocationMode } from '../../domain/discount-allocation-mode';
import type { SpendingGranularity } from '../../domain/spending-period';

/** The shop, as it travels over the wire. */
export interface EstablishmentView {
  /** Its CNPJ when it has one, its name otherwise — what the dataset groups by. */
  id: string;
  name: string;
  cnpj: string | null;
}

export interface EstablishmentInput {
  name: string;
  cnpj?: string | null;
}

/** One parsed line of an invoice, already matched against stock or not. */
export interface InvoiceLineInput {
  /** The merchant's product code, when the line came from an NFC-e. */
  code?: string | null;
  /** The unit as the note printed it. Display only — it never feeds `packageQuantity`. */
  unit?: string | null;
  description: string;
  quantity: number;
  /** Gross unit price as printed on the note, as a decimal string. */
  unitPrice: string;
  /** Gross line total as the note reports it, as a decimal string. */
  grossValue: string;
  isCompanyExpense: boolean;
  /** The matched `Material`, or null when the line does not become stock. */
  materialId: string | null;
}

export interface RegisterInvoicePurchaseInput {
  purchaseDate: Date;
  accessKey: string | null;
  rawInvoiceData: Record<string, unknown> | null;
  establishment?: EstablishmentInput | null;
  /** Note header total at full price, as a decimal string. */
  grossTotal: string;
  /** Note header discount, as a decimal string. `"0"` when there is none. */
  discountTotal: string;
  /** Defaults to `PROPORTIONAL`. `MANUAL` is not available at creation time. */
  discountAllocationMode?: DiscountAllocationMode;
  lines: InvoiceLineInput[];
}

/**
 * A purchase the user types in, with no note behind it.
 *
 * It has no `accessKey` and no `rawInvoiceData` — there is no captured note
 * to freeze — and its header total is the sum of the lines rather than a
 * figure read off a document. Everything downstream treats it exactly like an
 * imported purchase.
 */
export interface RegisterManualPurchaseInput {
  purchaseDate: Date;
  establishment?: EstablishmentInput | null;
  /** The whole discount given on the purchase, as a decimal string. `"0"` when there is none. */
  discountTotal?: string;
  /** Defaults to `PROPORTIONAL`. `MANUAL` is not available at creation time. */
  discountAllocationMode?: DiscountAllocationMode;
  lines: InvoiceLineInput[];
}

/** A line being added to an existing purchase. */
export interface AddPurchaseItemInput {
  code?: string | null;
  unit?: string | null;
  description: string;
  quantity: number;
  unitPrice: string;
  grossValue: string;
  isCompanyExpense: boolean;
  materialId: string | null;
}

/** What may be corrected on an existing line. */
export interface ChangePurchaseItemInput {
  quantity?: number;
  unitPrice?: string;
  grossValue?: string;
}

export interface SetDiscountAllocationInput {
  mode: DiscountAllocationMode;
  /** Required by `MANUAL`, and refused by every other mode. */
  manualAllocation?: { itemId: string; allocatedDiscount: string }[];
}

export interface PurchaseItemView {
  id: string;
  materialId: string | null;
  code: string | null;
  description: string;
  quantity: number;
  unit: string | null;
  unitPrice: string;
  grossValue: string;
  allocatedDiscount: string;
  /** Derived, never stored: `grossValue` minus `allocatedDiscount`. */
  netValue: string;
  isCompanyExpense: boolean;
  isStockMaterial: boolean;
}

export interface PurchaseView {
  id: string;
  purchaseDate: Date;
  accessKey: string | null;
  establishment: EstablishmentView | null;
  grossTotal: string;
  discountTotal: string;
  netTotal: string;
  discountAllocationMode: DiscountAllocationMode;
  /** True while a `MANUAL` attribution has been invalidated by an edit and not restated. */
  allocationPending: boolean;
  createdAt: Date;
  items: PurchaseItemView[];
}

/**
 * The detail of one purchase, with the captured note beside it.
 *
 * `rawInvoiceData` is what the user reconciles against the card statement, so
 * it is handed back exactly as it was captured — never rebuilt from the
 * lines, which by then may have been edited.
 */
export interface PurchaseDetailView extends PurchaseView {
  rawInvoiceData: Record<string, unknown> | null;
}

/**
 * A row of the history listing. It carries the totals and the number of
 * lines rather than the lines themselves; the detail endpoint is what opens
 * one up.
 */
export interface PurchaseSummaryView {
  id: string;
  purchaseDate: Date;
  accessKey: string | null;
  establishment: EstablishmentView | null;
  grossTotal: string;
  discountTotal: string;
  netTotal: string;
  discountAllocationMode: DiscountAllocationMode;
  allocationPending: boolean;
  itemCount: number;
  /** True when the purchase carries a captured note behind it. */
  hasInvoice: boolean;
  createdAt: Date;
}

export interface PurchaseListInput {
  from?: Date;
  to?: Date;
  establishmentId?: string;
  limit: number;
  offset: number;
}

export interface PurchasePageView {
  items: PurchaseSummaryView[];
  total: number;
  limit: number;
  offset: number;
}

export interface SpendingQueryInput {
  from: Date;
  to: Date;
  granularity: SpendingGranularity;
  establishmentId?: string;
}

/** Totals of one slice, with every amount as a decimal string. */
export interface SpendingTotalsView {
  netSpend: string;
  discountTotal: string;
  purchaseCount: number;
}

export interface SpendingByPeriodView extends SpendingTotalsView {
  period: string;
}

export interface SpendingByEstablishmentView extends SpendingTotalsView {
  establishmentId: string | null;
  establishmentName: string | null;
}

/**
 * The spending dataset as the panel receives it: buckets by dimension, not
 * finished figures. The total of the period, the average ticket and the
 * ranking are folds over these arrays, computed by the client.
 */
export interface SpendingDatasetView {
  from: Date;
  to: Date;
  granularity: SpendingGranularity;
  byPeriod: SpendingByPeriodView[];
  byEstablishment: SpendingByEstablishmentView[];
}
