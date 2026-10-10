import type { EntityReferenceCounts } from '../../../../shared/domain/errors/entity-in-use.error';
import type { CompositeProduct } from '../composite-product.entity';
import type { BillOfMaterials } from '../bill-of-materials.entity';

export const COMPOSITE_PRODUCT_REPOSITORY = Symbol('COMPOSITE_PRODUCT_REPOSITORY');

export interface CompositeProductRepository {
  findById(id: string): Promise<CompositeProduct | null>;
  findAll(): Promise<CompositeProduct[]>;
  save(product: CompositeProduct): Promise<void>;
  delete(id: string): Promise<void>;
  findBillOfMaterials(compositeProductId: string): Promise<BillOfMaterials | null>;
  saveBillOfMaterials(billOfMaterials: BillOfMaterials): Promise<void>;
  countReferences(compositeProductId: string): Promise<EntityReferenceCounts>;
}
