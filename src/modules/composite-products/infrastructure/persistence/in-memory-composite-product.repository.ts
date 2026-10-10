import type { EntityReferenceCounts } from '../../../../shared/domain/errors/entity-in-use.error';
import type { BillOfMaterials } from '../../domain/bill-of-materials.entity';
import type { CompositeProduct } from '../../domain/composite-product.entity';
import type { CompositeProductRepository } from '../../domain/repositories/composite-product.repository';

const NO_REFERENCES: EntityReferenceCounts = {
  saleItems: 0,
  bomItems: 0,
  purchaseItems: 0,
  stockMovements: 0,
};

/** In-memory `CompositeProductRepository` for `application/` tests. Never mocks Prisma. */
export class InMemoryCompositeProductRepository implements CompositeProductRepository {
  private readonly products = new Map<string, CompositeProduct>();
  private readonly billsOfMaterials = new Map<string, BillOfMaterials>();
  private readonly referenceCounts = new Map<string, number>();

  async findById(id: string): Promise<CompositeProduct | null> {
    return Promise.resolve(this.products.get(id) ?? null);
  }

  async findAll(): Promise<CompositeProduct[]> {
    return Promise.resolve([...this.products.values()]);
  }

  async save(product: CompositeProduct): Promise<void> {
    this.products.set(product.id, product);
    return Promise.resolve();
  }

  async delete(id: string): Promise<void> {
    this.products.delete(id);
    return Promise.resolve();
  }

  async findBillOfMaterials(compositeProductId: string): Promise<BillOfMaterials | null> {
    return Promise.resolve(this.billsOfMaterials.get(compositeProductId) ?? null);
  }

  async saveBillOfMaterials(billOfMaterials: BillOfMaterials): Promise<void> {
    this.billsOfMaterials.set(billOfMaterials.compositeProductId, billOfMaterials);
    return Promise.resolve();
  }

  async countReferences(compositeProductId: string): Promise<EntityReferenceCounts> {
    return Promise.resolve({
      ...NO_REFERENCES,
      saleItems: this.referenceCounts.get(compositeProductId) ?? 0,
    });
  }

  /** Test-only seam: simulates `compositeProductId` being referenced by a `SaleItem` row that lives in another module's table this fake has no access to. */
  setReferenceCount(compositeProductId: string, count: number): void {
    this.referenceCounts.set(compositeProductId, count);
  }
}
