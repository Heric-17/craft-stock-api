export interface BomItemInput {
  materialId: string;
  quantity: number;
}

export interface CreateCompositeProductInput {
  name: string;
  description: string | null;
  imageUrl: string | null;
  fixedOperationalCost: string;
  /** Percentage, e.g. `35` for 35%. */
  profitMargin: number;
  manualPrice: string | null;
  billOfMaterials: BomItemInput[];
}

/**
 * Every field optional: only the ones present are changed. `manualPrice`
 * follows the description/imageUrl convention — omitted leaves it untouched,
 * `null` clears it back to the suggested price.
 */
export interface UpdateCompositeProductInput {
  name?: string;
  description?: string | null;
  imageUrl?: string | null;
  fixedOperationalCost?: string;
  profitMargin?: number;
  manualPrice?: string | null;
  billOfMaterials?: BomItemInput[];
}

/** One `BillOfMaterials` line, joined with its `Material`'s current cost and stock — the dataset a client derives its own display from. */
export interface BomItemView {
  materialId: string;
  materialName: string;
  quantity: number;
  unitCost: string;
  lineCost: string;
  stockQuantity: number;
  possibleUnits: number;
}

export interface BottleneckView {
  materialId: string;
  materialName: string;
  possibleUnits: number;
}

/** Read model for a `CompositeProduct`. Every cost, price, and capacity field is computed at read time — never persisted. */
export interface CompositeProductView {
  id: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  fixedOperationalCost: string;
  profitMargin: number;
  manualPrice: string | null;
  materialsCost: string;
  totalCost: string;
  suggestedPrice: string;
  finalPrice: string;
  productionCapacity: number;
  bottleneck: BottleneckView | null;
  billOfMaterials: BomItemView[];
  createdAt: Date;
  updatedAt: Date;
}
