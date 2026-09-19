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
   * Historical snapshot, written once at creation from the referenced
   * CompositeProduct's `finalPrice` (or the loose Material's `unitCost`) —
   * see CLAUDE.md section 10. The FK stays for navigation only; every read
   * of sale history must display these snapshot fields, never the
   * referenced entity's current name/price.
   */
  itemNameSnapshot: string;
  unitPriceSnapshot: Money;
}

export class SaleItem {
  readonly id: string;
  readonly saleId: string;
  readonly compositeProductId: string | null;
  readonly materialId: string | null;
  readonly quantity: number;
  readonly itemNameSnapshot: string;
  readonly unitPriceSnapshot: Money;

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

    this.id = props.id;
    this.saleId = props.saleId;
    this.compositeProductId = props.compositeProductId;
    this.materialId = props.materialId;
    this.quantity = props.quantity;
    this.itemNameSnapshot = props.itemNameSnapshot;
    this.unitPriceSnapshot = props.unitPriceSnapshot;
  }

  /** Derived from the snapshot, never persisted — same principle as `unitCost`. */
  get subtotal(): Money {
    return this.unitPriceSnapshot.times(this.quantity);
  }

  /**
   * The only supported edit to an existing line: quantity. Deliberately the
   * lone immutable-edit method on this entity — there is no generic
   * `update()` like `Material`/`CompositeProduct` have, because every other
   * field is either the id/reference (changing it means removing this line
   * and creating another) or the snapshot (frozen forever by CLAUDE.md
   * section 10). Keeping this narrow is what makes "nothing overwrites the
   * snapshot after creation" true by construction, not by convention.
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
      unitPriceSnapshot: this.unitPriceSnapshot,
    };
  }
}
