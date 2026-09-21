import type { SpendingGranularity } from '../../domain/ports/purchase-analytics.port';

/** One parsed line of an invoice, already matched against stock or not. */
export interface InvoiceLineInput {
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
  lines: InvoiceLineInput[];
}

export interface PurchaseItemView {
  id: string;
  materialId: string | null;
  description: string;
  quantity: number;
  unitPrice: string;
  grossValue: string;
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
