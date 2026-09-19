/** Read model for a `Material`, with `unitCost`, `lowStock`, and `isActive` computed at read time — never persisted. */
export interface MaterialView {
  id: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  packageCost: string;
  packageQuantity: number;
  stockQuantity: number;
  minimumStockAlert: number;
  unitCost: string;
  lowStock: boolean;
  isActive: boolean;
  discontinuedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface MaterialPriceHistoryView {
  id: string;
  materialId: string;
  previousValue: string;
  newValue: string;
  origin: string;
  changedAt: Date;
}

export interface CreateMaterialInput {
  name: string;
  description: string | null;
  imageUrl: string | null;
  packageCost: string;
  packageQuantity: number;
  stockQuantity: number;
  minimumStockAlert: number;
}

export interface UpdateMaterialInput {
  name?: string;
  description?: string | null;
  imageUrl?: string | null;
  packageCost?: string;
  packageQuantity?: number;
  minimumStockAlert?: number;
}

/**
 * `MANUAL`: a person adjusting stock by hand — never touches `packageCost`.
 * `INVOICE_SYNC`: stock entering because an imported NFC-e was matched to
 * this Material — may carry the package cost reported on the note, subject
 * to the "price only goes up" rule.
 */
export type StockEntrySource = 'MANUAL' | 'INVOICE_SYNC';

export interface StockEntryInput {
  relativeIncrement?: number;
  absoluteQuantity?: number;
  source: StockEntrySource;
  invoicePackageCost?: string;
}
