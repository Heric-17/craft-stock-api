import { Money } from '../../../shared/domain/money/money';
import { InvalidPurchaseError } from './purchase.error';

export interface PurchaseItemProps {
  id: string;
  purchaseId: string;
  /** The merchant's product code, when the line came from an NFC-e. */
  code: string | null;
  description: string;
  quantity: number;
  /** The unit as the note printed it. Display only — it never feeds `packageQuantity`. */
  unit: string | null;
  /** Gross unit price, as printed on the note — never net of any discount. */
  unitPrice: Money;
  /**
   * Gross line value: what this line costs at full price. It is what the
   * invoice itself reports for the line, which is why it is kept even though
   * it is usually `unitPrice × quantity` — the issuer's own rounding is the
   * authority here, not ours.
   */
  grossValue: Money;
  /**
   * This line's share of the note's discount.
   *
   * Persisted, and deliberately so. In `PROPORTIONAL`, `COMPANY_ONLY` and
   * `PERSONAL_ONLY` it is computed, but in `MANUAL` it is the user's direct
   * input and derives from nothing at all. Making it a derived value would
   * take the manual mode away.
   */
  allocatedDiscount: Money;
  /** Independent flags: being a stock Material implies being a company expense, but the reverse does not hold. */
  isCompanyExpense: boolean;
  isStockMaterial: boolean;
  /** Set if, and only if, isStockMaterial is true. */
  materialId: string | null;
}

/**
 * A line of a `Purchase`.
 *
 * It exposes no setter for `isCompanyExpense`, `isStockMaterial` or
 * `allocatedDiscount`, and there is no repository for it. Both of those are
 * structural, not stylistic: `allocatedDiscount` is a stored value that
 * depends on `isCompanyExpense`, so a line whose classification moved without
 * the discount being reattributed would sit outside the eligible set still
 * holding discount. The totals would still add up, no invariant on the sum
 * would notice, and the only symptom would be a wrong number on the spending
 * panel. The way through is `Purchase.classifyItem`, which reattributes
 * before it returns.
 */
export class PurchaseItem {
  readonly id: string;
  readonly purchaseId: string;
  readonly code: string | null;
  readonly description: string;
  readonly quantity: number;
  readonly unit: string | null;
  readonly unitPrice: Money;
  readonly grossValue: Money;
  readonly allocatedDiscount: Money;
  readonly isCompanyExpense: boolean;
  readonly isStockMaterial: boolean;
  readonly materialId: string | null;

  constructor(props: PurchaseItemProps) {
    if (!Number.isFinite(props.quantity) || props.quantity <= 0) {
      throw new InvalidPurchaseError(
        'PurchaseItem quantity must be a finite number greater than zero.',
      );
    }

    if (props.grossValue.isNegative() || props.allocatedDiscount.isNegative()) {
      throw new InvalidPurchaseError(
        'PurchaseItem grossValue and allocatedDiscount must not be negative.',
      );
    }

    if (props.allocatedDiscount.isGreaterThan(props.grossValue)) {
      throw new InvalidPurchaseError(
        'PurchaseItem allocatedDiscount must not exceed grossValue: a line never takes more discount than it is worth.',
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
    this.code = props.code;
    this.description = props.description;
    this.quantity = props.quantity;
    this.unit = props.unit;
    this.unitPrice = props.unitPrice;
    this.grossValue = props.grossValue;
    this.allocatedDiscount = props.allocatedDiscount;
    this.isCompanyExpense = props.isCompanyExpense;
    this.isStockMaterial = props.isStockMaterial;
    this.materialId = props.materialId;
  }

  /**
   * What was actually paid for this line. Derived on every read, never a
   * column: it is always `grossValue − allocatedDiscount`, and storing it
   * would be a third number to keep in step with the other two.
   */
  get netValue(): Money {
    return this.grossValue.minus(this.allocatedDiscount);
  }

  /**
   * The cost of one package, as this line reports it — the only figure a
   * `Material`'s `packageCost` is ever fed from. Derived from `grossValue`,
   * never from `netValue`, in every allocation mode: a discount is a one-off
   * event, while `packageCost` answers what restocking will cost next time.
   * Pricing a `CompositeProduct` off a promotional price assumes the
   * promotion lasts.
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

  toProps(): PurchaseItemProps {
    return {
      id: this.id,
      purchaseId: this.purchaseId,
      code: this.code,
      description: this.description,
      quantity: this.quantity,
      unit: this.unit,
      unitPrice: this.unitPrice,
      grossValue: this.grossValue,
      allocatedDiscount: this.allocatedDiscount,
      isCompanyExpense: this.isCompanyExpense,
      isStockMaterial: this.isStockMaterial,
      materialId: this.materialId,
    };
  }
}
