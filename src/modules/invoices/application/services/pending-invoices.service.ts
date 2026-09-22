import { Inject, Injectable } from '@nestjs/common';

import { UNIT_OF_WORK, type UnitOfWork } from '../../../../shared/domain/persistence/unit-of-work';
import type { PendingInvoiceStatus } from '../../domain/pending-invoice-status.enum';
import type { PendingInvoiceView } from '../dto/invoices.dto';
import { InvoiceViewMapper } from '../mappers/invoice-view.mapper';

/**
 * Reading side of the import queue.
 *
 * The queue is what decouples scanning from importing: a note is captured
 * with a phone at the till and the import is finished later, from whatever
 * device, including after a stretch where the portal was refusing to answer.
 */
@Injectable()
export class PendingInvoicesService {
  constructor(@Inject(UNIT_OF_WORK) private readonly unitOfWork: UnitOfWork) {}

  async list(status?: PendingInvoiceStatus): Promise<PendingInvoiceView[]> {
    const invoices = await this.unitOfWork.runInTransaction((ctx) =>
      status === undefined
        ? ctx.pendingInvoices.findAll()
        : ctx.pendingInvoices.findByStatus(status),
    );

    return invoices.map((invoice) => InvoiceViewMapper.toPendingView(invoice));
  }
}
