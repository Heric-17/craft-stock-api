import type { Money } from '../../../shared/domain/money/money';
import { InvalidSaleError } from './sale.error';

export interface SaleItemProps {
  id: string;
  saleId: string;
  /** Exactly one of compositeProductId / materialId must be set. */
  compositeProductId: string | null;
  materialId: string | null;
  quantity: number;
  unitPrice: Money;
}

export class SaleItem {
  readonly id: string;
  readonly saleId: string;
  readonly compositeProductId: string | null;
  readonly materialId: string | null;
  readonly quantity: number;
  readonly unitPrice: Money;

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

    this.id = props.id;
    this.saleId = props.saleId;
    this.compositeProductId = props.compositeProductId;
    this.materialId = props.materialId;
    this.quantity = props.quantity;
    this.unitPrice = props.unitPrice;
  }

  get subtotal(): Money {
    return this.unitPrice.times(this.quantity);
  }
}
