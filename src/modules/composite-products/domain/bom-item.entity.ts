import { InvalidCompositeProductError } from './composite-product.error';

export interface BomItemProps {
  id: string;
  billOfMaterialsId: string;
  materialId: string;
  /** Quantity of the Material consumed per unit produced, in its consumption unit. */
  quantity: number;
}

export class BomItem {
  readonly id: string;
  readonly billOfMaterialsId: string;
  readonly materialId: string;
  readonly quantity: number;

  constructor(props: BomItemProps) {
    if (!Number.isFinite(props.quantity) || props.quantity <= 0) {
      throw new InvalidCompositeProductError(
        'BomItem quantity must be a finite number greater than zero.',
      );
    }

    this.id = props.id;
    this.billOfMaterialsId = props.billOfMaterialsId;
    this.materialId = props.materialId;
    this.quantity = props.quantity;
  }
}
