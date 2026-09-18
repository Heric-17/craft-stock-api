import type { Money } from '../../../shared/domain/money/money';
import { InvalidPurchaseError } from './purchase.error';

export interface PurchaseItemProps {
  id: string;
  purchaseId: string;
  description: string;
  quantity: number;
  unitPrice: Money;
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
  readonly isCompanyExpense: boolean;
  readonly isStockMaterial: boolean;
  readonly materialId: string | null;

  constructor(props: PurchaseItemProps) {
    if (!Number.isFinite(props.quantity) || props.quantity <= 0) {
      throw new InvalidPurchaseError(
        'PurchaseItem quantity must be a finite number greater than zero.',
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
    this.isCompanyExpense = props.isCompanyExpense;
    this.isStockMaterial = props.isStockMaterial;
    this.materialId = props.materialId;
  }

  get totalPrice(): Money {
    return this.unitPrice.times(this.quantity);
  }
}
