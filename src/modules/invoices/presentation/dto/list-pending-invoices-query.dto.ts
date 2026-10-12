import { IsIn, IsOptional } from 'class-validator';

import { PaginationQueryDto } from '../../../../shared/presentation/http/pagination-query.dto';
import {
  PENDING_INVOICE_STATUSES,
  type PendingInvoiceStatus,
} from '../../domain/pending-invoice-status.enum';

export class ListPendingInvoicesQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsIn(PENDING_INVOICE_STATUSES)
  status?: PendingInvoiceStatus;
}
