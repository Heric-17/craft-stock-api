import type { EntityReferenceCounts } from '../../../../shared/domain/errors/entity-in-use.error';
import type { Material } from '../../domain/material.entity';
import type { MaterialPriceHistory } from '../../domain/material-price-history.entity';
import type { MaterialRepository } from '../../domain/repositories/material.repository';

const NO_REFERENCES: EntityReferenceCounts = {
  saleItems: 0,
  bomItems: 0,
  purchaseItems: 0,
  stockMovements: 0,
};

/** In-memory `MaterialRepository` for `application/` tests. Never mocks Prisma. */
export class InMemoryMaterialRepository implements MaterialRepository {
  private readonly materials = new Map<string, Material>();
  private readonly priceHistories: MaterialPriceHistory[] = [];
  private readonly referenceCounts = new Map<string, EntityReferenceCounts>();

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

  async countReferences(materialId: string): Promise<EntityReferenceCounts> {
    return Promise.resolve(this.referenceCounts.get(materialId) ?? NO_REFERENCES);
  }

  async countBomItemReferences(materialId: string): Promise<number> {
    return Promise.resolve(this.countsFor(materialId).bomItems);
  }

  /**
   * Test-only seam: simulates `materialId` being referenced by rows that
   * would, in Postgres, live in another module's table this fake has no
   * access to. The counts land on `saleItems` because a past sale is the
   * reference that blocks deletion and nothing else — use
   * `setReferenceCounts` when a test cares which kind.
   */
  setReferenceCount(materialId: string, count: number): void {
    this.setReferenceCounts(materialId, { saleItems: count });
  }

  /** Same seam, when a test needs a specific breakdown. */
  setReferenceCounts(materialId: string, counts: Partial<EntityReferenceCounts>): void {
    this.referenceCounts.set(materialId, { ...this.countsFor(materialId), ...counts });
  }

  /**
   * Test-only seam: simulates `materialId` being consumed by `count`
   * `BillOfMaterials` lines, which in Postgres live in another module's
   * table this fake has no access to.
   */
  setBomItemReferenceCount(materialId: string, count: number): void {
    this.setReferenceCounts(materialId, { bomItems: count });
  }

  private countsFor(materialId: string): EntityReferenceCounts {
    return this.referenceCounts.get(materialId) ?? NO_REFERENCES;
  }
}
