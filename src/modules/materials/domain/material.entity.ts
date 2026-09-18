import type { Money } from '../../../shared/domain/money/money';
import { InvalidMaterialError } from './material.error';

export interface MaterialProps {
  id: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  /** Cost of the whole purchased package, e.g. R$ 12.90 for a 1kg bag of flour. */
  packageCost: Money;
  /** Quantity in the purchased package, in the unit the Material is consumed by. */
  packageQuantity: number;
  /** Current balance in stock, in fractional consumption units. */
  stockQuantity: number;
  minimumStockAlert: number;
  createdAt: Date;
  updatedAt: Date;
}

export class Material {
  readonly id: string;
  readonly name: string;
  readonly description: string | null;
  readonly imageUrl: string | null;
  readonly packageCost: Money;
  readonly packageQuantity: number;
  readonly stockQuantity: number;
  readonly minimumStockAlert: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  constructor(props: MaterialProps) {
    if (props.name.trim().length === 0) {
      throw new InvalidMaterialError('Material name must not be empty.');
    }

    if (!Number.isFinite(props.packageQuantity) || props.packageQuantity <= 0) {
      throw new InvalidMaterialError(
        'Material packageQuantity must be a finite number greater than zero.',
      );
    }

    if (!Number.isFinite(props.stockQuantity) || props.stockQuantity < 0) {
      throw new InvalidMaterialError(
        'Material stockQuantity must be a finite number greater than or equal to zero.',
      );
    }

    if (!Number.isFinite(props.minimumStockAlert) || props.minimumStockAlert < 0) {
      throw new InvalidMaterialError(
        'Material minimumStockAlert must be a finite number greater than or equal to zero.',
      );
    }

    this.id = props.id;
    this.name = props.name;
    this.description = props.description;
    this.imageUrl = props.imageUrl;
    this.packageCost = props.packageCost;
    this.packageQuantity = props.packageQuantity;
    this.stockQuantity = props.stockQuantity;
    this.minimumStockAlert = props.minimumStockAlert;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  /**
   * Fractioned cost per consumption unit. Deliberately NOT persisted anywhere:
   * it is always `packageCost / packageQuantity`, recomputed on every read so
   * that correcting `packageCost` propagates instantly to every
   * `CompositeProduct` that consumes this Material — no cache, no trigger, no
   * recalculation routine.
   */
  get unitCost(): Money {
    return this.packageCost.dividedBy(this.packageQuantity);
  }

  get isBelowMinimumStock(): boolean {
    return this.stockQuantity <= this.minimumStockAlert;
  }
}
