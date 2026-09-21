/** One Material's aggregated need across a set of selected Sales, against its current stock. */
export interface ShortageLine {
  materialId: string;
  needed: number;
  stockQuantity: number;
}

export interface ShortageResult {
  materialId: string;
  needed: number;
  stockQuantity: number;
  /** `shortage(material) = max(0, needed − inStock)`. */
  shortage: number;
}

/** Backs the aggregated shopping list: what still needs buying for a set of selected Sales. */
export function calculateShortage(lines: readonly ShortageLine[]): ShortageResult[] {
  return lines.map((line) => ({
    materialId: line.materialId,
    needed: line.needed,
    stockQuantity: line.stockQuantity,
    shortage: Math.max(0, line.needed - line.stockQuantity),
  }));
}
