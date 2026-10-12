import { IsIn, IsOptional } from 'class-validator';

import { PaginationQueryDto } from '../../../../shared/presentation/http/pagination-query.dto';
import { PAYMENT_STATUSES, type PaymentStatus } from '../../domain/payment-status.enum';
import { PRODUCTION_STATUSES, type ProductionStatus } from '../../domain/production-status.enum';

/** Case 4: filter by either or both independent status axes. */
export class ListSalesQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsIn(PAYMENT_STATUSES)
  paymentStatus?: PaymentStatus;

  @IsOptional()
  @IsIn(PRODUCTION_STATUSES)
  productionStatus?: ProductionStatus;
}
