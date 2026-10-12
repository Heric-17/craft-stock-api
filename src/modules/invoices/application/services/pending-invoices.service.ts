import { Inject, Injectable } from '@nestjs/common';

import { UNIT_OF_WORK, type UnitOfWork } from '../../../../shared/domain/persistence/unit-of-work';
import type { PendingInvoiceListInput, PendingInvoicePageView } from '../dto/invoices.dto';
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

  /** One page of the queue, newest first, optionally narrowed to one status. */
  async list(input: PendingInvoiceListInput): Promise<PendingInvoicePageView> {
    const page = await this.unitOfWork.runInTransaction((ctx) =>
      ctx.pendingInvoices.findPage({
        ...(input.status !== undefined ? { status: input.status } : {}),
        limit: input.limit,
        offset: input.offset,
      }),
    );

    return {
      items: page.invoices.map((invoice) => InvoiceViewMapper.toPendingView(invoice)),
      total: page.total,
      limit: page.limit,
      offset: page.offset,
    };
  }
}
