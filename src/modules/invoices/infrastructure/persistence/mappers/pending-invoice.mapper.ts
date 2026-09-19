import type { PendingInvoiceModel } from '../../../../../shared/infrastructure/prisma/generated/models';
import type { Prisma } from '../../../../../shared/infrastructure/prisma/generated/client';
import { PendingInvoice } from '../../../domain/pending-invoice.entity';

export class PendingInvoiceMapper {
  static toDomain(row: PendingInvoiceModel): PendingInvoice {
    return new PendingInvoice({
      id: row.id,
      url: row.url,
      status: row.status,
      attemptCount: row.attemptCount,
      lastAttemptAt: row.lastAttemptAt,
      createdAt: row.createdAt,
    });
  }

  static toPersistence(invoice: PendingInvoice): Prisma.PendingInvoiceUncheckedCreateInput {
    return {
      id: invoice.id,
      url: invoice.url,
      status: invoice.status,
      attemptCount: invoice.attemptCount,
      lastAttemptAt: invoice.lastAttemptAt,
      createdAt: invoice.createdAt,
    };
  }
}
