/** One `BillOfMaterials` line, reduced to what a capacity projection needs: how much of the Material a unit consumes, and how much is in stock. */
export interface ProductionCapacityLine {
  materialId: string;
  quantity: number;
  stockQuantity: number;
}

export interface MaterialCapacity {
  materialId: string;
  /** `possibleUnits(material) = floor(material.stockQuantity / bomItem.quantity)`. */
  possibleUnits: number;
}

export interface ProductionCapacityResult {
  /** `productionCapacity = min(possibleUnits)` across every `BillOfMaterials` item. Zero for an empty `BillOfMaterials` — there is nothing to run out of, but also nothing that can be produced. */
  productionCapacity: number;
  /**
   * The Material with the lowest `possibleUnits` — the one that runs out first.
   * `null` only when the `BillOfMaterials` has no items.
   *
   * Tie-break rule: when two or more Materials tie for the lowest
   * `possibleUnits`, the one listed **first** in the `BillOfMaterials` wins.
   * This is an arbitrary but deterministic choice — ties carry no extra
   * business meaning, so the rule only needs to be stable and documented.
   */
  bottleneck: MaterialCapacity | null;
  perMaterial: readonly MaterialCapacity[];
}

export function calculateProductionCapacity(
  lines: readonly ProductionCapacityLine[],
): ProductionCapacityResult {
  const perMaterial = lines.map((line) => ({
    materialId: line.materialId,
    possibleUnits: Math.floor(line.stockQuantity / line.quantity),
  }));

  const bottleneck = perMaterial.reduce<MaterialCapacity | null>((lowest, current) => {
    if (lowest === null || current.possibleUnits < lowest.possibleUnits) {
      return current;
    }

    return lowest;
  }, null);

  return {
    productionCapacity: bottleneck?.possibleUnits ?? 0,
    bottleneck,
    perMaterial,
  };
}
