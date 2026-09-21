import type { CompositeProduct } from '../composite-product.entity';
import type { BillOfMaterials } from '../bill-of-materials.entity';

export const COMPOSITE_PRODUCT_REPOSITORY = Symbol('COMPOSITE_PRODUCT_REPOSITORY');

export interface CompositeProductRepository {
  findById(id: string): Promise<CompositeProduct | null>;
  findAll(): Promise<CompositeProduct[]>;
  save(product: CompositeProduct): Promise<void>;
  delete(id: string): Promise<void>;
  findBillOfMaterials(compositeProductId: string): Promise<BillOfMaterials | null>;
  /** Upserts the `BillOfMaterials` row and fully replaces its items — `BomItem` has no lifecycle of its own outside the recipe it belongs to. */
  saveBillOfMaterials(billOfMaterials: BillOfMaterials): Promise<void>;

  countReferences(compositeProductId: string): Promise<number>;
}
