import type { Money } from '../../../shared/domain/money/money';
import { InvalidCompositeProductError } from './composite-product.error';

export interface CompositeProductProps {
  id: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  /** Fixed assembly cost (packaging, finishing) added on top of material cost. */
  fixedOperationalCost: Money;
  /** Desired profit margin, as a percentage (e.g. 35 for 35%). */
  profitMargin: number;
  /** Practiced price, optional. When set, overrides the suggested price. */
  manualPrice: Money | null;
  createdAt: Date;
  updatedAt: Date;
}

export class CompositeProduct {
  readonly id: string;
  readonly name: string;
  readonly description: string | null;
  readonly imageUrl: string | null;
  readonly fixedOperationalCost: Money;
  readonly profitMargin: number;
  readonly manualPrice: Money | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  constructor(props: CompositeProductProps) {
    if (props.name.trim().length === 0) {
      throw new InvalidCompositeProductError('CompositeProduct name must not be empty.');
    }

    if (!Number.isFinite(props.profitMargin) || props.profitMargin < 0) {
      throw new InvalidCompositeProductError(
        'CompositeProduct profitMargin must be a finite number greater than or equal to zero.',
      );
    }

    this.id = props.id;
    this.name = props.name;
    this.description = props.description;
    this.imageUrl = props.imageUrl;
    this.fixedOperationalCost = props.fixedOperationalCost;
    this.profitMargin = props.profitMargin;
    this.manualPrice = props.manualPrice;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }
}
