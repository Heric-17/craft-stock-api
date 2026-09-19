import type { BillOfMaterials } from '../../domain/bill-of-materials.entity';
import type { CompositeProduct } from '../../domain/composite-product.entity';
import type { CompositeProductRepository } from '../../domain/repositories/composite-product.repository';

/** In-memory `CompositeProductRepository` for `application/` tests. Never mocks Prisma. */
export class InMemoryCompositeProductRepository implements CompositeProductRepository {
  private readonly products = new Map<string, CompositeProduct>();
  private readonly billsOfMaterials = new Map<string, BillOfMaterials>();

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
}
