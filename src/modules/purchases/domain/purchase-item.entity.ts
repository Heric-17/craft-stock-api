import { Money } from '../../../shared/domain/money/money';
import { InvalidPurchaseError } from './purchase.error';

export interface PurchaseItemProps {
  id: string;
  purchaseId: string;
  description: string;
  quantity: number;
  /** Gross unit price, as printed on the note — never net of any discount. */
  unitPrice: Money;
  /**
   * Gross line value: what this line would cost at full price. It is what the
   * invoice itself reports for the line, which is why it is kept even though
   * it is usually `unitPrice × quantity` — the issuer's own rounding is the
   * authority here, not ours.
   */
  grossValue: Money;
  /**
   * Net line value: this line's share of what was actually paid, after the
   * note's discount was spread proportionally across every line. Kept because
   * it cannot be recovered from this line alone — the rounding residue of the
   * spread depends on all the other lines of the same note.
   */
  netValue: Money;
  /** Independent flags: being a stock Material implies being a company expense, but the reverse does not hold. */
  isCompanyExpense: boolean;
  isStockMaterial: boolean;
  /** Set if, and only if, isStockMaterial is true. */
  materialId: string | null;
}

export class PurchaseItem {
  readonly id: string;
  readonly purchaseId: string;
  readonly description: string;
  readonly quantity: number;
  readonly unitPrice: Money;
  readonly grossValue: Money;
  readonly netValue: Money;
  readonly isCompanyExpense: boolean;
  readonly isStockMaterial: boolean;
  readonly materialId: string | null;

  constructor(props: PurchaseItemProps) {
    if (!Number.isFinite(props.quantity) || props.quantity <= 0) {
      throw new InvalidPurchaseError(
        'PurchaseItem quantity must be a finite number greater than zero.',
      );
    }

    if (props.grossValue.isNegative() || props.netValue.isNegative()) {
      throw new InvalidPurchaseError('PurchaseItem grossValue and netValue must not be negative.');
    }

    if (props.netValue.isGreaterThan(props.grossValue)) {
      throw new InvalidPurchaseError(
        'PurchaseItem netValue must not exceed grossValue: a discount never raises what was paid.',
      );
    }

    if (props.isStockMaterial && !props.isCompanyExpense) {
      throw new InvalidPurchaseError(
        'PurchaseItem cannot be a stock Material without also being a company expense.',
      );
    }

    if (props.isStockMaterial !== (props.materialId !== null)) {
      throw new InvalidPurchaseError(
        'PurchaseItem materialId must be set if, and only if, isStockMaterial is true.',
      );
    }

    this.id = props.id;
    this.purchaseId = props.purchaseId;
    this.description = props.description;
    this.quantity = props.quantity;
    this.unitPrice = props.unitPrice;
    this.grossValue = props.grossValue;
    this.netValue = props.netValue;
    this.isCompanyExpense = props.isCompanyExpense;
    this.isStockMaterial = props.isStockMaterial;
    this.materialId = props.materialId;
  }

  /**
   * The cost of one package, as this line reports it — the only figure a
   * `Material`'s `packageCost` is ever fed from. Derived from `grossValue`,
   * never from `netValue`: a discount is a one-off event, while `packageCost`
   * answers what restocking will cost next time. Pricing a
   * `CompositeProduct` off a promotional price assumes the promotion lasts.
   */
  get packageCostBasis(): Money {
    return this.grossValue.dividedBy(this.quantity);
  }

  /**
   * What this line contributed to what the company spent. Zero for a line
   * that is not a company expense, so summing it over a period is the
   * spending figure — the gross side never takes part in that sum.
   */
  get expenseValue(): Money {
    return this.isCompanyExpense ? this.netValue : Money.zero();
  }

  /** The discount this line absorbed: the gap between full price and paid. */
  get discountValue(): Money {
    return this.grossValue.minus(this.netValue);
  }
}
