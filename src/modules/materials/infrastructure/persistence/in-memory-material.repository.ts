import type { Material } from '../../domain/material.entity';
import type { MaterialPriceHistory } from '../../domain/material-price-history.entity';
import type { MaterialRepository } from '../../domain/repositories/material.repository';

/** In-memory `MaterialRepository` for `application/` tests. Never mocks Prisma. */
export class InMemoryMaterialRepository implements MaterialRepository {
  private readonly materials = new Map<string, Material>();
  private readonly priceHistories: MaterialPriceHistory[] = [];

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
}
