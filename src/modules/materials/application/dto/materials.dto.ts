import type { ConsumptionUnit } from '../../domain/consumption-unit';

/**
 * Read model for a `Material`, with `unitCost`, `lowStock`, and `isActive`
 * computed at read time — never persisted.
 *
 * Every quantity here — `packageQuantity`, `stockQuantity`,
 * `minimumStockAlert` — and the per-unit cost are in `consumptionUnit`, which
 * travels with them along with the symbol to write them with. A number of
 * grams and a number of units are indistinguishable otherwise.
 */
export interface MaterialView {
  id: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  packageCost: string;
  packageQuantity: number;
  consumptionUnit: ConsumptionUnit;
  /** How `consumptionUnit` is written: `g`, `ml`, `cm`, `un`. */
  consumptionUnitSymbol: string;
  stockQuantity: number;
  minimumStockAlert: number;
  /** Cost of one `consumptionUnit`, for display only. */
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

/**
 * `imageUrl` is absent on purpose: it is never free text. It is only ever a
 * key a `StorageProvider` generated, set through `MaterialsService.setImage`
 * — the dedicated upload endpoint — never through create or update.
 */
export interface CreateMaterialInput {
  name: string;
  description: string | null;
  packageCost: string;
  packageQuantity: number;
  consumptionUnit: ConsumptionUnit;
  stockQuantity: number;
  minimumStockAlert: number;
}

/** `consumptionUnit` and `imageUrl` are absent on purpose: see `CreateMaterialInput` and `changeConsumptionUnit`. */
export interface UpdateMaterialInput {
  name?: string;
  description?: string | null;
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
