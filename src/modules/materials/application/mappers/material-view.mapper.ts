import type { Material } from '../../domain/material.entity';
import type { MaterialPriceHistory } from '../../domain/material-price-history.entity';
import type { MaterialPriceHistoryView, MaterialView } from '../dto/materials.dto';

export class MaterialViewMapper {
  static toView(material: Material): MaterialView {
    return {
      id: material.id,
      name: material.name,
      description: material.description,
      imageUrl: material.imageUrl,
      packageCost: material.packageCost.toDecimalString(),
      packageQuantity: material.packageQuantity,
      stockQuantity: material.stockQuantity,
      minimumStockAlert: material.minimumStockAlert,
      unitCost: material.unitCost.toDecimalString(),
      lowStock: material.isBelowMinimumStock,
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
