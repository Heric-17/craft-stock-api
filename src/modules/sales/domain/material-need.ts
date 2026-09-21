/** One `SaleItem`, reduced to what need-aggregation requires. */
export interface SaleItemNeedInput {
  compositeProductId: string | null;
  materialId: string | null;
  quantity: number;
}

/** One `BomItem`, reduced to what need-aggregation requires. */
export interface BomNeedLine {
  materialId: string;
  quantity: number;
}

/**
 * `need(material) = Σ (bomItem.quantity × saleItem.quantity)` for every
 * `SaleItem` that references a `CompositeProduct`, `+ saleItem.quantity` for
 * every `SaleItem` that references a loose `Material` ("avulso") directly.
 *
 * `bomByCompositeProductId` supplies each referenced CompositeProduct's
 * `BillOfMaterials` lines, already resolved by the caller — this function
 * does no I/O, so it serves both the single-`Sale` stock debit and the
 * multi-`Sale` shopping-list aggregation ("baixa de estoque" and
 * "lista de compras agregada").
 */
export function calculateMaterialNeed(
  items: readonly SaleItemNeedInput[],
  bomByCompositeProductId: ReadonlyMap<string, readonly BomNeedLine[]>,
): Map<string, number> {
  const need = new Map<string, number>();

  const add = (materialId: string, quantity: number): void => {
    need.set(materialId, (need.get(materialId) ?? 0) + quantity);
  };

  for (const item of items) {
    if (item.materialId !== null) {
      add(item.materialId, item.quantity);
      continue;
    }

    const bomLines = bomByCompositeProductId.get(item.compositeProductId as string) ?? [];
    for (const bomLine of bomLines) {
      add(bomLine.materialId, bomLine.quantity * item.quantity);
    }
  }

  return need;
}
