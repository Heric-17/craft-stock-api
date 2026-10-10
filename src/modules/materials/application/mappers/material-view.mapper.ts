import { consumptionUnitSymbol } from '../../domain/consumption-unit';
import type { Material } from '../../domain/material.entity';
import type { MaterialPriceHistory } from '../../domain/material-price-history.entity';
import type { ResolveImageUrl } from '../../../../shared/application/storage/resolve-image-url';
import type { MaterialPriceHistoryView, MaterialView } from '../dto/materials.dto';

export class MaterialViewMapper {
  /**
   * `resolveImageUrl` is passed in rather than reached for: the mapper stays
   * a pure function of its inputs, and the service — which already holds the
   * `StorageProvider` factory — decides which backend resolves the key.
   */
  static toView(material: Material, resolveImageUrl: ResolveImageUrl): MaterialView {
    return {
      id: material.id,
      name: material.name,
      description: material.description,
      imageUrl: resolveImageUrl(material.imageKey),
      packageCost: material.packageCost.toDecimalString(),
      packageQuantity: material.packageQuantity,
      consumptionUnit: material.consumptionUnit,
      consumptionUnitSymbol: consumptionUnitSymbol(material.consumptionUnit),
      stockQuantity: material.stockQuantity,
      minimumStockAlert: material.minimumStockAlert,
      unitCost: material.unitCost,
      lowStock: material.isBelowMinimumStock,
      isActive: material.isActive,
      discontinuedAt: material.discontinuedAt,
      createdAt: material.createdAt,
      updatedAt: material.updatedAt,
    };
  }

  static toPriceHistoryView(entry: MaterialPriceHistory): MaterialPriceHistoryView {
    return {
      id: entry.id,
      materialId: entry.materialId,
      previousValue: entry.previousValue.toDecimalString(),
      newValue: entry.newValue.toDecimalString(),
      origin: entry.origin,
      changedAt: entry.changedAt,
    };
  }
}
