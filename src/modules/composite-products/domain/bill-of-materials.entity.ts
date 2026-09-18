import { InvalidCompositeProductError } from './composite-product.error';
import type { BomItem } from './bom-item.entity';

export interface BillOfMaterialsProps {
  id: string;
  compositeProductId: string;
  items: BomItem[];
}

/** A CompositeProduct's recipe: which Materials it consumes, and how much of each. */
export class BillOfMaterials {
  readonly id: string;
  readonly compositeProductId: string;
  readonly items: readonly BomItem[];

  constructor(props: BillOfMaterialsProps) {
    const materialIds = new Set(props.items.map((item) => item.materialId));

    if (materialIds.size !== props.items.length) {
      throw new InvalidCompositeProductError(
        'BillOfMaterials must not reference the same Material more than once.',
      );
    }

    this.id = props.id;
    this.compositeProductId = props.compositeProductId;
    this.items = props.items;
  }
}
