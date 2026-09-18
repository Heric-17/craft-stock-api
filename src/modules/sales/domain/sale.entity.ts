import { InvalidSaleError } from './sale.error';
import type { PaymentStatus } from './payment-status.enum';
import type { ProductionStatus } from './production-status.enum';

export interface SaleProps {
  id: string;
  customerName: string;
  customerContact: string | null;
  paymentMethod: string;
  /**
   * Payment and production are two independent state axes — never combine
   * them into a single status enum. A sale can be PAID while still PENDING
   * assembly, or ASSEMBLED while payment is still PENDING.
   */
  paymentStatus: PaymentStatus;
  productionStatus: ProductionStatus;
  createdAt: Date;
  updatedAt: Date;
}

export class Sale {
  readonly id: string;
  readonly customerName: string;
  readonly customerContact: string | null;
  readonly paymentMethod: string;
  readonly paymentStatus: PaymentStatus;
  readonly productionStatus: ProductionStatus;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  constructor(props: SaleProps) {
    if (props.customerName.trim().length === 0) {
      throw new InvalidSaleError('Sale customerName must not be empty.');
    }

    if (props.paymentMethod.trim().length === 0) {
      throw new InvalidSaleError('Sale paymentMethod must not be empty.');
    }

    this.id = props.id;
    this.customerName = props.customerName;
    this.customerContact = props.customerContact;
    this.paymentMethod = props.paymentMethod;
    this.paymentStatus = props.paymentStatus;
    this.productionStatus = props.productionStatus;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }
}
