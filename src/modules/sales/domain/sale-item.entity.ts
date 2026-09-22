import { formatFractionalAmount } from '../../../shared/domain/money/fractional-amount';
import type { Money } from '../../../shared/domain/money/money';
import { InvalidSaleError } from './sale.error';

export interface SaleItemProps {
  id: string;
  saleId: string;
  /** Exactly one of compositeProductId / materialId must be set. */
  compositeProductId: string | null;
  materialId: string | null;
  quantity: number;
  /**
   * Historical snapshot, written once at creation. The FK stays for
   * navigation only; every read of sale history must display these snapshot
   * fields, never the referenced entity's current name/price.
   */
  itemNameSnapshot: string;
  /**
   * The price fraction, frozen as a pair rather than as the per-unit figure
   * it divides out to:
   *
   * - `CompositeProduct`: the product's `finalPrice` at the time of sale,
   *   over a `priceBasisQuantity` of 1.
   * - loose Material ("avulso"): the marked-up cost of one whole package,
   *   over the `packageQuantity` that package holds, in consumption units.
   *
   * Keeping both numbers is what makes the frozen price exact. A single
   * per-unit `Money` holds whole cents, and a Material sold by the gram or
   * the millilitre costs a fraction of one: flour at R$ 28,00 the kilo is
   * R$ 0,028 per gram, which as a `Money` can only be R$ 0,03, and 120 g of
   * it then sells for R$ 3,60 instead of R$ 3,36. The division happens in
   * {@link lineTotal}, once, with the fraction of a cent still intact.
   */
  priceBasisAmount: Money;
  priceBasisQuantity: number;
}

export class SaleItem {
  readonly id: string;
  readonly saleId: string;
  readonly compositeProductId: string | null;
  readonly materialId: string | null;
  readonly quantity: number;
  readonly itemNameSnapshot: string;
  readonly priceBasisAmount: Money;
  readonly priceBasisQuantity: number;

  constructor(props: SaleItemProps) {
    const referencesProduct = props.compositeProductId !== null;
    const referencesMaterial = props.materialId !== null;

    if (referencesProduct === referencesMaterial) {
      throw new InvalidSaleError(
        'SaleItem must reference exactly one of compositeProductId or materialId, never both or neither.',
      );
    }

    if (!Number.isFinite(props.quantity) || props.quantity <= 0) {
      throw new InvalidSaleError('SaleItem quantity must be a finite number greater than zero.');
    }

    if (props.itemNameSnapshot.trim().length === 0) {
      throw new InvalidSaleError('SaleItem itemNameSnapshot must not be empty.');
    }

    if (!Number.isFinite(props.priceBasisQuantity) || props.priceBasisQuantity <= 0) {
      throw new InvalidSaleError(
        'SaleItem priceBasisQuantity must be a finite number greater than zero.',
      );
    }

    if (props.priceBasisAmount.isNegative()) {
      throw new InvalidSaleError('SaleItem priceBasisAmount must not be negative.');
    }

    this.id = props.id;
    this.saleId = props.saleId;
    this.compositeProductId = props.compositeProductId;
    this.materialId = props.materialId;
    this.quantity = props.quantity;
    this.itemNameSnapshot = props.itemNameSnapshot;
    this.priceBasisAmount = props.priceBasisAmount;
    this.priceBasisQuantity = props.priceBasisQuantity;
  }

  /**
   * `priceBasisAmount × quantity ÷ priceBasisQuantity` — derived on every
   * read, never persisted, same principle as `unitCost`.
   *
   * Multiplied before divided, rounded exactly once at the end. Dividing
   * first to get a price per unit and multiplying that would round a
   * sub-cent figure up to a whole cent before it is ever scaled, which is
   * how 120 g of flour turns into R$ 3,60 instead of R$ 3,36.
   */
  get lineTotal(): Money {
    return this.priceBasisAmount.scaled(this.quantity, this.priceBasisQuantity);
  }

  /**
   * The price of one consumption unit, as a decimal string with four places,
   * **for display only**.
   *
   * A string and not a `Money` for the same reason as `Material.unitCost`:
   * whole cents cannot hold R$ 0,0280 per gram, and there is nothing in a
   * string to multiply by. Every amount of money comes from
   * {@link lineTotal}.
   */
  get unitPrice(): string {
    return formatFractionalAmount(this.priceBasisAmount, this.priceBasisQuantity);
  }

  /**
   * The only supported edit to an existing line: quantity. Deliberately the
   * lone immutable-edit method on this entity — there is no generic
   * `update()` like `Material`/`CompositeProduct` have, because every other
   * field is either the id/reference (changing it means removing this line
   * and creating another) or the snapshot (frozen forever). Keeping this
   * narrow is what makes "nothing overwrites the snapshot after creation"
   * true by construction, not by convention.
   */
  withQuantity(newQuantity: number): SaleItem {
    return new SaleItem({ ...this.toProps(), quantity: newQuantity });
  }

  private toProps(): SaleItemProps {
    return {
      id: this.id,
      saleId: this.saleId,
      compositeProductId: this.compositeProductId,
      materialId: this.materialId,
      quantity: this.quantity,
      itemNameSnapshot: this.itemNameSnapshot,
      priceBasisAmount: this.priceBasisAmount,
      priceBasisQuantity: this.priceBasisQuantity,
    };
  }
}
