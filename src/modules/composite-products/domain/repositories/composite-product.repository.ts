import type { CompositeProduct } from '../composite-product.entity';
import type { BillOfMaterials } from '../bill-of-materials.entity';

export const COMPOSITE_PRODUCT_REPOSITORY = Symbol('COMPOSITE_PRODUCT_REPOSITORY');

export interface CompositeProductRepository {
  findById(id: string): Promise<CompositeProduct | null>;
  findAll(): Promise<CompositeProduct[]>;
  save(product: CompositeProduct): Promise<void>;
  /** Physical delete. Callers must check `countReferences` first — see CLAUDE.md section 9. */
  delete(id: string): Promise<void>;
  findBillOfMaterials(compositeProductId: string): Promise<BillOfMaterials | null>;
  /** Upserts the `BillOfMaterials` row and fully replaces its items — `BomItem` has no lifecycle of its own outside the recipe it belongs to. */
  saveBillOfMaterials(billOfMaterials: BillOfMaterials): Promise<void>;
  /**
   * Counts `SaleItem` rows referencing this CompositeProduct — the reference
   * type that blocks physical deletion (CLAUDE.md section 9). Its own
   * `BillOfMaterials`/`BomItem` belong to this aggregate and are cascaded
   * away with it, not a blocking cross-aggregate reference.
   */
  countReferences(compositeProductId: string): Promise<number>;
}
