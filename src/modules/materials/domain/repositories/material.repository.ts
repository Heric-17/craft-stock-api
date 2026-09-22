import type { Material } from '../material.entity';
import type { MaterialPriceHistory } from '../material-price-history.entity';

export const MATERIAL_REPOSITORY = Symbol('MATERIAL_REPOSITORY');

export interface MaterialRepository {
  findById(id: string): Promise<Material | null>;
  findAll(): Promise<Material[]>;
  save(material: Material): Promise<void>;
  /** Physical delete. Callers must check `countReferences` first. */
  delete(id: string): Promise<void>;
  addPriceHistoryEntry(entry: MaterialPriceHistory): Promise<void>;
  findPriceHistoryByMaterialId(materialId: string): Promise<MaterialPriceHistory[]>;
  /**
   * Counts `BomItem` + `SaleItem` + `PurchaseItem` + `StockMovementSnapshot`
   * rows referencing this Material — the reference types that block physical
   * deletion. `MaterialPriceHistory` is excluded: it
   * belongs to this Material's own aggregate and is cascaded away with it,
   * not a blocking cross-aggregate reference.
   */
  countReferences(materialId: string): Promise<number>;
  /**
   * Counts only the `BomItem` rows referencing this Material — the subset of
   * references whose quantities are expressed in the Material's
   * `consumptionUnit`, and therefore the ones that lock it.
   *
   * Separate from `countReferences` because the two questions are different:
   * physical deletion asks whether any history points here at all, while the
   * unit asks whether any recipe quantity would change meaning. A past
   * `SaleItem` blocks the first and not the second.
   */
  countBomItemReferences(materialId: string): Promise<number>;
}
