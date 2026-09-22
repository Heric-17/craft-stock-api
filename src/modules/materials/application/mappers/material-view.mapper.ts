import { consumptionUnitSymbol } from '../../domain/consumption-unit';
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
