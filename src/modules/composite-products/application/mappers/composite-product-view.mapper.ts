import type { Material } from '../../../materials/domain/material.entity';
import type { BillOfMaterials } from '../../domain/bill-of-materials.entity';
import {
  calculateFinalPrice,
  calculateMaterialsCost,
  calculateSuggestedPrice,
  calculateTotalCost,
} from '../../domain/composite-product-pricing';
import type { CompositeProduct } from '../../domain/composite-product.entity';
import { calculateProductionCapacity } from '../../domain/production-capacity';
import type { BomItemView, CompositeProductView } from '../dto/composite-products.dto';

export class CompositeProductViewMapper {
  /**
   * Builds the read model for a `CompositeProduct`: every cost, price, and
   * capacity figure is derived here, from the `BillOfMaterials` and the
   * current state of each `Material` it references — none of it is
   * persisted.
   */
  static toView(
    product: CompositeProduct,
    billOfMaterials: BillOfMaterials,
    materialsById: ReadonlyMap<string, Material>,
  ): CompositeProductView {
    const items = billOfMaterials.items.map((item) => ({
      item,
      material: CompositeProductViewMapper.materialOrThrow(materialsById, item.materialId),
    }));

    const materialsCost = calculateMaterialsCost(
      items.map(({ item, material }) => ({ quantity: item.quantity, unitCost: material.unitCost })),
    );
    const totalCost = calculateTotalCost(materialsCost, product.fixedOperationalCost);
    const suggestedPrice = calculateSuggestedPrice(totalCost, product.profitMargin);
    const finalPrice = calculateFinalPrice(suggestedPrice, product.manualPrice);

    const capacity = calculateProductionCapacity(
      items.map(({ item, material }) => ({
        materialId: item.materialId,
        quantity: item.quantity,
        stockQuantity: material.stockQuantity,
      })),
    );
    const possibleUnitsByMaterialId = new Map(
      capacity.perMaterial.map((entry) => [entry.materialId, entry.possibleUnits]),
    );

    const billOfMaterialsView: BomItemView[] = items.map(({ item, material }) => ({
      materialId: item.materialId,
      materialName: material.name,
      quantity: item.quantity,
      unitCost: material.unitCost.toDecimalString(),
      lineCost: material.unitCost.times(item.quantity).toDecimalString(),
      stockQuantity: material.stockQuantity,
      possibleUnits: possibleUnitsByMaterialId.get(item.materialId) ?? 0,
    }));

    const bottleneckMaterial = capacity.bottleneck
      ? CompositeProductViewMapper.materialOrThrow(materialsById, capacity.bottleneck.materialId)
      : null;

    return {
      id: product.id,
      name: product.name,
      description: product.description,
      imageUrl: product.imageUrl,
      fixedOperationalCost: product.fixedOperationalCost.toDecimalString(),
      profitMargin: product.profitMargin,
      manualPrice: product.manualPrice?.toDecimalString() ?? null,
      materialsCost: materialsCost.toDecimalString(),
      totalCost: totalCost.toDecimalString(),
      suggestedPrice: suggestedPrice.toDecimalString(),
      finalPrice: finalPrice.toDecimalString(),
      productionCapacity: capacity.productionCapacity,
      bottleneck:
        capacity.bottleneck && bottleneckMaterial
          ? {
              materialId: capacity.bottleneck.materialId,
              materialName: bottleneckMaterial.name,
              possibleUnits: capacity.bottleneck.possibleUnits,
            }
          : null,
      billOfMaterials: billOfMaterialsView,
      createdAt: product.createdAt,
      updatedAt: product.updatedAt,
    };
  }

  private static materialOrThrow(
    materialsById: ReadonlyMap<string, Material>,
    materialId: string,
  ): Material {
    const material = materialsById.get(materialId);

    if (!material) {
      throw new Error(`Material ${materialId} referenced by a BillOfMaterials was not preloaded.`);
    }

    return material;
  }
}
