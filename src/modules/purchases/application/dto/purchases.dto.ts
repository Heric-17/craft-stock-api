import type { SpendingGranularity } from '../../domain/ports/purchase-analytics.port';

import type { DiscountAllocationMode } from '../../domain/discount-allocation-mode';

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
  /** Note header total at full price, as a decimal string. */
  grossTotal: string;
  /** Note header discount, as a decimal string. `"0"` when there is none. */
  discountTotal: string;
  /** Defaults to `PROPORTIONAL`. `MANUAL` is not available at creation time. */
  discountAllocationMode?: DiscountAllocationMode;
  lines: InvoiceLineInput[];
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
  grossTotal: string;
  discountTotal: string;
  netTotal: string;
  discountAllocationMode: DiscountAllocationMode;
  /** True while a `MANUAL` attribution has been invalidated by an edit and not restated. */
  allocationPending: boolean;
  createdAt: Date;
  items: PurchaseItemView[];
}

export interface SpendingQueryInput {
  from: Date;
  to: Date;
  granularity: SpendingGranularity;
}

/** One bucket of the spending dataset, as the panel consumes it. */
export interface SpendingByPeriodView {
  period: string;
  netSpend: string;
  discountTotal: string;
}
