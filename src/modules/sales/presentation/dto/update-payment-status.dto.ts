import { IsIn } from 'class-validator';

import { PAYMENT_STATUSES, type PaymentStatus } from '../../domain/payment-status.enum';

export class UpdatePaymentStatusDto {
  @IsIn(PAYMENT_STATUSES)
  paymentStatus!: PaymentStatus;
}
