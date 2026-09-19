import type { Material } from '../material.entity';
import type { MaterialPriceHistory } from '../material-price-history.entity';

export const MATERIAL_REPOSITORY = Symbol('MATERIAL_REPOSITORY');

export interface MaterialRepository {
  findById(id: string): Promise<Material | null>;
  findAll(): Promise<Material[]>;
  save(material: Material): Promise<void>;
  delete(id: string): Promise<void>;
  addPriceHistoryEntry(entry: MaterialPriceHistory): Promise<void>;
  findPriceHistoryByMaterialId(materialId: string): Promise<MaterialPriceHistory[]>;
}
