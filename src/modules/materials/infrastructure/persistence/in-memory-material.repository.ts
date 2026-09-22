import type { Material } from '../../domain/material.entity';
import type { MaterialPriceHistory } from '../../domain/material-price-history.entity';
import type { MaterialRepository } from '../../domain/repositories/material.repository';

/** In-memory `MaterialRepository` for `application/` tests. Never mocks Prisma. */
export class InMemoryMaterialRepository implements MaterialRepository {
  private readonly materials = new Map<string, Material>();
  private readonly priceHistories: MaterialPriceHistory[] = [];
  private readonly referenceCounts = new Map<string, number>();
  private readonly bomItemReferenceCounts = new Map<string, number>();

  async findById(id: string): Promise<Material | null> {
    return Promise.resolve(this.materials.get(id) ?? null);
  }

  async findAll(): Promise<Material[]> {
    return Promise.resolve([...this.materials.values()]);
  }

  async save(material: Material): Promise<void> {
    this.materials.set(material.id, material);
    return Promise.resolve();
  }

  async delete(id: string): Promise<void> {
    this.materials.delete(id);
    return Promise.resolve();
  }

  async addPriceHistoryEntry(entry: MaterialPriceHistory): Promise<void> {
    this.priceHistories.push(entry);
    return Promise.resolve();
  }

  async findPriceHistoryByMaterialId(materialId: string): Promise<MaterialPriceHistory[]> {
    return Promise.resolve(this.priceHistories.filter((entry) => entry.materialId === materialId));
  }

  async countReferences(materialId: string): Promise<number> {
    return Promise.resolve(this.referenceCounts.get(materialId) ?? 0);
  }

  async countBomItemReferences(materialId: string): Promise<number> {
    return Promise.resolve(this.bomItemReferenceCounts.get(materialId) ?? 0);
  }

  /**
   * Test-only seam: simulates `materialId` being referenced by a `BomItem`,
   * `SaleItem`, `PurchaseItem`, or `StockMovementSnapshot` row that would, in
   * Postgres, live in another module's table this fake has no access to.
   */
  setReferenceCount(materialId: string, count: number): void {
    this.referenceCounts.set(materialId, count);
  }

  /**
   * Test-only seam: simulates `materialId` being consumed by `count`
   * `BillOfMaterials` lines, which in Postgres live in another module's
   * table this fake has no access to.
   */
  setBomItemReferenceCount(materialId: string, count: number): void {
    this.bomItemReferenceCounts.set(materialId, count);
    this.referenceCounts.set(materialId, (this.referenceCounts.get(materialId) ?? 0) + count);
  }
}
