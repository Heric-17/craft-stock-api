import { formatFractionalAmount } from '../../../shared/domain/money/fractional-amount';
import type { Money } from '../../../shared/domain/money/money';
import type { ConsumptionUnit } from './consumption-unit';
import { ConsumptionUnitLockedError, InvalidMaterialError } from './material.error';

export interface MaterialProps {
  id: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  /** Cost of the whole purchased package, e.g. R$ 12.90 for a 1kg bag of flour. */
  packageCost: Money;
  /** Quantity in the purchased package, in the unit the Material is consumed by. */
  packageQuantity: number;
  /**
   * The base unit every quantity of this Material is expressed in:
   * `packageQuantity`, `stockQuantity`, `minimumStockAlert` and the quantity
   * of every `BomItem` that consumes it.
   */
  consumptionUnit: ConsumptionUnit;
  /** Current balance in stock, in fractional consumption units. */
  stockQuantity: number;
  minimumStockAlert: number;
  discontinuedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/** What exists elsewhere in the system expressed in this Material's current unit. */
export interface MaterialUsage {
  /** How many `BomItem` lines consume this Material. */
  bomItemReferences: number;
}

export class Material {
  readonly id: string;
  readonly name: string;
  readonly description: string | null;
  readonly imageUrl: string | null;
  readonly packageCost: Money;
  readonly packageQuantity: number;
  readonly consumptionUnit: ConsumptionUnit;
  readonly stockQuantity: number;
  readonly minimumStockAlert: number;
  readonly discontinuedAt: Date | null;
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
    this.consumptionUnit = props.consumptionUnit;
    this.stockQuantity = props.stockQuantity;
    this.minimumStockAlert = props.minimumStockAlert;
    this.discontinuedAt = props.discontinuedAt;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  get isActive(): boolean {
    return this.discontinuedAt === null;
  }

  /**
   * Fractioned cost per consumption unit, **for display only**.
   *
   * It is a decimal string and not a `Money` on purpose. A `Money` holds
   * whole cents, and the per-unit cost of anything measured in grams,
   * millilitres or centimetres is routinely smaller than a cent: a 1 kg bag
   * of flour at R$ 28,00 costs R$ 0,028 per gram. As a `Money` that can only
   * be R$ 0,03, and multiplying that by the 120 g a recipe uses yields
   * R$ 3,60 instead of R$ 3,36.
   *
   * Returning a string makes it structurally impossible to use this figure
   * as the base of a calculation — there is nothing to multiply. Anything
   * that needs an amount of money calls {@link costFor}, which keeps the
   * fraction of a cent alive until the end.
   *
   * Like `lowStock` and `isActive`, it is never persisted: it is recomputed
   * on every read so that correcting `packageCost` propagates instantly to
   * every `CompositeProduct` that consumes this Material.
   */
  get unitCost(): string {
    return formatFractionalAmount(this.packageCost, this.packageQuantity);
  }

  /**
   * What `quantity` consumption units of this Material actually cost.
   *
   * The single entry point for pricing anything off this Material. It
   * multiplies before dividing and rounds exactly once, so a fractional
   * ingredient costs what it costs rather than what a per-unit figure
   * rounded to the nearest cent implies.
   */
  costFor(quantity: number): Money {
    return this.packageCost.scaled(quantity, this.packageQuantity);
  }

  get isBelowMinimumStock(): boolean {
    return this.stockQuantity <= this.minimumStockAlert;
  }

  /**
   * Immutable edit: applies `changes` on top of the current state.
   *
   * `consumptionUnit` is deliberately outside what this accepts, and is
   * reapplied below so a caller that casts its way past the type cannot
   * change it either. It changes what every other quantity on this Material
   * *means*, so it moves only through {@link changeConsumptionUnit}, which
   * refuses when there is anything already expressed in the old unit.
   */
  update(
    changes: Partial<Omit<MaterialProps, 'id' | 'createdAt' | 'consumptionUnit'>>,
    updatedAt: Date,
  ): Material {
    return new Material({
      ...this.toProps(),
      ...changes,
      consumptionUnit: this.consumptionUnit,
      updatedAt,
    });
  }

  /**
   * Switches the unit this Material is consumed by — allowed only while
   * nothing is expressed in the current one.
   *
   * A Material holding 500 in `UNIT` that becomes `GRAM` now holds 500 g,
   * and a `BomItem` asking for 2 of it now asks for 2 g. No data changed and
   * every number means something else: the stock balance, the recipe
   * quantities, and through them the cost of every `CompositeProduct` that
   * consumes it. Nothing about the resulting state looks wrong, which is
   * exactly why this is refused rather than converted.
   *
   * The two conditions are the two places a quantity in the old unit can
   * exist: the stock balance, and the `BillOfMaterials` lines that consume
   * it. `bomItemReferences` is counted by the caller, since those lines
   * belong to another aggregate — the rule itself stays here and stays
   * testable without a database.
   */
  changeConsumptionUnit(
    newConsumptionUnit: ConsumptionUnit,
    usage: MaterialUsage,
    updatedAt: Date,
  ): Material {
    if (newConsumptionUnit === this.consumptionUnit) {
      return this;
    }

    if (this.stockQuantity > 0) {
      throw new ConsumptionUnitLockedError(
        `Material ${this.id} holds ${this.stockQuantity} in stock, measured in ${this.consumptionUnit}. Zero the stock before changing its consumption unit.`,
      );
    }

    if (usage.bomItemReferences > 0) {
      throw new ConsumptionUnitLockedError(
        `Material ${this.id} is used by ${usage.bomItemReferences} BillOfMaterials line(s), whose quantities are expressed in ${this.consumptionUnit}. Remove them before changing its consumption unit.`,
      );
    }

    return new Material({
      ...this.toProps(),
      consumptionUnit: newConsumptionUnit,
      updatedAt,
    });
  }

  withStockQuantity(newStockQuantity: number, updatedAt: Date): Material {
    return this.update({ stockQuantity: newStockQuantity }, updatedAt);
  }

  /**
   * Applies a `packageCost` reported by an imported invoice. Deliberately
   * replaces the current cost only when the reported one is strictly
   * greater: a promotional, one-off price on a single note must not pull
   * down the cost used to plan future restocking. Returns the same instance,
   * unchanged, when the reported cost is not an increase.
   */
  receiveInvoicePackageCost(reportedPackageCost: Money, updatedAt: Date): Material {
    if (!reportedPackageCost.isGreaterThan(this.packageCost)) {
      return this;
    }

    return this.update({ packageCost: reportedPackageCost }, updatedAt);
  }

  discontinue(discontinuedAt: Date): Material {
    if (!this.isActive) {
      throw new InvalidMaterialError(`Material ${this.id} is already discontinued.`);
    }

    return this.update({ discontinuedAt }, discontinuedAt);
  }

  reactivate(updatedAt: Date): Material {
    if (this.isActive) {
      throw new InvalidMaterialError(`Material ${this.id} is already active.`);
    }

    return this.update({ discontinuedAt: null }, updatedAt);
  }

  private toProps(): MaterialProps {
    return {
      id: this.id,
      name: this.name,
      description: this.description,
      imageUrl: this.imageUrl,
      packageCost: this.packageCost,
      packageQuantity: this.packageQuantity,
      consumptionUnit: this.consumptionUnit,
      stockQuantity: this.stockQuantity,
      minimumStockAlert: this.minimumStockAlert,
      discontinuedAt: this.discontinuedAt,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}
