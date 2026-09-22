import type { ConsumptionUnit } from '../../../materials/domain/consumption-unit';
import type { DiscountAllocationMode } from '../../../purchases/domain/discount-allocation-mode';
import type { PendingInvoiceStatus } from '../../domain/pending-invoice-status.enum';

export interface PendingInvoiceView {
  id: string;
  url: string;
  status: PendingInvoiceStatus;
  attemptCount: number;
  lastAttemptAt: Date | null;
  purchaseId: string | null;
  lastError: string | null;
  createdAt: Date;
}

/**
 * One line of an imported note, as the classification screen shows it.
 *
 * `unit` and `unitDisplay` are both here and both informative. The user reads
 * them to decide what the line actually contains, and then types the
 * `packageQuantity` themselves — nothing on this view ever becomes that
 * number on its own.
 */
export interface ImportedInvoiceItemView {
  id: string;
  code: string | null;
  description: string;
  quantity: number;
  /** The unit exactly as the note printed it, suffix and all. */
  unit: string | null;
  /** The same unit with the till's numeric suffix removed, for reading. */
  unitDisplay: string | null;
  unitPrice: string;
  grossValue: string;
  allocatedDiscount: string;
  /** Derived, never stored: `grossValue` minus `allocatedDiscount`. */
  netValue: string;
  isCompanyExpense: boolean;
  isStockMaterial: boolean;
  materialId: string | null;
  /**
   * The unit the `Material` behind this line is consumed by, null until the
   * line has one. Shown so the user can check the conversion they just
   * described makes sense: a note that sold "1 PCT" feeding a Material
   * measured in grams should hold a `packageQuantity` in the hundreds, not 1.
   */
  materialConsumptionUnit: ConsumptionUnit | null;
  /** How `materialConsumptionUnit` is written: `g`, `ml`, `cm`, `un`. */
  materialConsumptionUnitSymbol: string | null;
}

export interface ImportedInvoiceView {
  purchaseId: string;
  /** The capture this purchase came from. Null when the purchase is read on its own. */
  pendingInvoiceId: string | null;
  accessKey: string | null;
  merchantName: string | null;
  purchaseDate: Date;
  grossTotal: string;
  discountTotal: string;
  netTotal: string;
  discountAllocationMode: DiscountAllocationMode;
  allocationPending: boolean;
  /**
   * Whether the user has to be asked how the discount is attributed. False on
   * a note without a discount: every line is zero and the question never
   * appears.
   */
  requiresDiscountAllocationChoice: boolean;
  items: ImportedInvoiceItemView[];
}

/** What the user decides about one line, on the classification screen. */
export interface ClassifyInvoiceItemInput {
  itemId: string;
  isCompanyExpense: boolean;
  isStockMaterial: boolean;
  /**
   * The `Material` this line stocks. Required when `isStockMaterial` and no
   * `newMaterial` is given.
   */
  materialId?: string;
  /**
   * A `Material` to create for this line. The user gives the consumption unit
   * and how much of it one package holds — the note cannot answer either.
   */
  newMaterial?: {
    name: string;
    /**
     * The unit the new Material is consumed by. Required, and the user's
     * alone: the note's unit says how the item was rung up. Pointing at an
     * existing Material instead uses that Material's unit, which is never
     * changed from here.
     */
    consumptionUnit: ConsumptionUnit;
    minimumStockAlert?: number;
  };
  /**
   * How much of the consumption unit one purchased package contains: 1000 for
   * a 1 kg bag measured in grams, 200 for a packet of cheese measured in
   * grams. Always the user's, never the note's.
   *
   * The unit it counts is `newMaterial.consumptionUnit` for a new Material,
   * and the existing Material's own unit otherwise.
   */
  packageQuantity?: number;
}

export interface ClassifyInvoiceInput {
  purchaseId: string;
  items: ClassifyInvoiceItemInput[];
  /** Only consulted when the note carries a discount. */
  discountAllocationMode?: DiscountAllocationMode;
  /** Amount per line, as decimal strings. Required by, and only by, `MANUAL`. */
  manualAllocation?: { itemId: string; allocatedDiscount: string }[];
}
