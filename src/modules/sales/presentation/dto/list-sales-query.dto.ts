import { IsIn, IsOptional } from 'class-validator';

import { PAYMENT_STATUSES, type PaymentStatus } from '../../domain/payment-status.enum';
import { PRODUCTION_STATUSES, type ProductionStatus } from '../../domain/production-status.enum';

/** Case 4: filter by either or both independent status axes. */
export class ListSalesQueryDto {
  @IsOptional()
  @IsIn(PAYMENT_STATUSES)
  paymentStatus?: PaymentStatus;

  @IsOptional()
  @IsIn(PRODUCTION_STATUSES)
  productionStatus?: ProductionStatus;
}
