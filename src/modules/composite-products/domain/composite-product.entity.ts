import { MAX_MARGIN_BASIS_POINTS } from '../../../shared/domain/money/margin';
import type { Money } from '../../../shared/domain/money/money';
import { InvalidCompositeProductError } from './composite-product.error';

export interface CompositeProductProps {
  id: string;
  name: string;
  description: string | null;
  imageKey: string | null;
  /** Fixed assembly cost (packaging, finishing) added on top of material cost. */
  fixedOperationalCost: Money;
  /** Desired profit margin in whole basis points: 35% is `3500`, 33,33% is `3333`. */
  profitMarginBasisPoints: number;
  /** Practiced price, optional. When set, overrides the suggested price. */
  manualPrice: Money | null;
  discontinuedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export class CompositeProduct {
  readonly id: string;
  readonly name: string;
  readonly description: string | null;
  readonly imageKey: string | null;
  readonly fixedOperationalCost: Money;
  readonly profitMarginBasisPoints: number;
  readonly manualPrice: Money | null;
  readonly discontinuedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  constructor(props: CompositeProductProps) {
    if (props.name.trim().length === 0) {
      throw new InvalidCompositeProductError('CompositeProduct name must not be empty.');
    }

    if (
      !Number.isInteger(props.profitMarginBasisPoints) ||
      props.profitMarginBasisPoints < 0 ||
      props.profitMarginBasisPoints > MAX_MARGIN_BASIS_POINTS
    ) {
      throw new InvalidCompositeProductError(
        `CompositeProduct profitMarginBasisPoints must be a whole number between 0 and ${MAX_MARGIN_BASIS_POINTS}.`,
      );
    }

    this.id = props.id;
    this.name = props.name;
    this.description = props.description;
    this.imageKey = props.imageKey;
    this.fixedOperationalCost = props.fixedOperationalCost;
    this.profitMarginBasisPoints = props.profitMarginBasisPoints;
    this.manualPrice = props.manualPrice;
    this.discontinuedAt = props.discontinuedAt;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  get isActive(): boolean {
    return this.discontinuedAt === null;
  }

  /** Immutable edit: applies `changes` on top of the current state. */
  update(
    changes: Partial<Omit<CompositeProductProps, 'id' | 'createdAt'>>,
    updatedAt: Date,
  ): CompositeProduct {
    return new CompositeProduct({ ...this.toProps(), ...changes, updatedAt });
  }

  discontinue(discontinuedAt: Date): CompositeProduct {
    if (!this.isActive) {
      throw new InvalidCompositeProductError(
        `CompositeProduct ${this.id} is already discontinued.`,
      );
    }

    return this.update({ discontinuedAt }, discontinuedAt);
  }

  reactivate(updatedAt: Date): CompositeProduct {
    if (this.isActive) {
      throw new InvalidCompositeProductError(`CompositeProduct ${this.id} is already active.`);
    }

    return this.update({ discontinuedAt: null }, updatedAt);
  }

  private toProps(): CompositeProductProps {
    return {
      id: this.id,
      name: this.name,
      description: this.description,
      imageKey: this.imageKey,
      fixedOperationalCost: this.fixedOperationalCost,
      profitMarginBasisPoints: this.profitMarginBasisPoints,
      manualPrice: this.manualPrice,
      discontinuedAt: this.discontinuedAt,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}
