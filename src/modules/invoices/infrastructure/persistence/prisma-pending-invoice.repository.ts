import { Inject, Injectable } from '@nestjs/common';

import { PRISMA_CLIENT } from '../../../../shared/infrastructure/prisma/prisma-client.token';
import type { Prisma } from '../../../../shared/infrastructure/prisma/generated/client';
import type { PendingInvoice } from '../../domain/pending-invoice.entity';
import type {
  PendingInvoiceListQuery,
  PendingInvoicePage,
  PendingInvoiceRepository,
} from '../../domain/repositories/pending-invoice.repository';
import { PendingInvoiceMapper } from './mappers/pending-invoice.mapper';

@Injectable()
export class PrismaPendingInvoiceRepository implements PendingInvoiceRepository {
  constructor(@Inject(PRISMA_CLIENT) private readonly prisma: Prisma.TransactionClient) {}

  async findById(id: string): Promise<PendingInvoice | null> {
    const row = await this.prisma.pendingInvoice.findUnique({ where: { id } });
    return row ? PendingInvoiceMapper.toDomain(row) : null;
  }

  async findPage(query: PendingInvoiceListQuery): Promise<PendingInvoicePage> {
    const where = query.status !== undefined ? { status: query.status } : {};

    // The count is its own query over the same filter: the page is by
    // definition not the whole set, so `total` cannot be folded out of it.
    const [rows, total] = await Promise.all([
      this.prisma.pendingInvoice.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: query.offset,
        take: query.limit,
      }),
      this.prisma.pendingInvoice.count({ where }),
    ]);

    return {
      invoices: rows.map((row) => PendingInvoiceMapper.toDomain(row)),
      total,
      limit: query.limit,
      offset: query.offset,
    };
  }

  async findByUrl(url: string): Promise<PendingInvoice | null> {
    const row = await this.prisma.pendingInvoice.findFirst({
      where: { url },
      orderBy: { createdAt: 'desc' },
    });
    return row ? PendingInvoiceMapper.toDomain(row) : null;
  }

  async save(invoice: PendingInvoice): Promise<void> {
    const data = PendingInvoiceMapper.toPersistence(invoice);

    await this.prisma.pendingInvoice.upsert({
      where: { id: invoice.id },
      create: data,
      update: data,
    });
  }

  async delete(id: string): Promise<void> {
    await this.prisma.pendingInvoice.delete({ where: { id } });
  }
}
