import { IsIn, IsOptional } from 'class-validator';

import {
  PENDING_INVOICE_STATUSES,
  type PendingInvoiceStatus,
} from '../../domain/pending-invoice-status.enum';

export class ListPendingInvoicesQueryDto {
  @IsOptional()
  @IsIn(PENDING_INVOICE_STATUSES)
  status?: PendingInvoiceStatus;
}
