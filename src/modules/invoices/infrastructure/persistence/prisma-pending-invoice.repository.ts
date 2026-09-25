import { Inject, Injectable } from '@nestjs/common';

import { PRISMA_CLIENT } from '../../../../shared/infrastructure/prisma/prisma-client.token';
import type { Prisma } from '../../../../shared/infrastructure/prisma/generated/client';
import type { PendingInvoice } from '../../domain/pending-invoice.entity';
import type { PendingInvoiceStatus } from '../../domain/pending-invoice-status.enum';
import type { PendingInvoiceRepository } from '../../domain/repositories/pending-invoice.repository';
import { PendingInvoiceMapper } from './mappers/pending-invoice.mapper';

@Injectable()
export class PrismaPendingInvoiceRepository implements PendingInvoiceRepository {
  constructor(@Inject(PRISMA_CLIENT) private readonly prisma: Prisma.TransactionClient) {}

  async findById(id: string): Promise<PendingInvoice | null> {
    const row = await this.prisma.pendingInvoice.findUnique({ where: { id } });
    return row ? PendingInvoiceMapper.toDomain(row) : null;
  }

  async findByStatus(status: PendingInvoiceStatus): Promise<PendingInvoice[]> {
    const rows = await this.prisma.pendingInvoice.findMany({ where: { status } });
    return rows.map((row) => PendingInvoiceMapper.toDomain(row));
  }

  async findAll(): Promise<PendingInvoice[]> {
    const rows = await this.prisma.pendingInvoice.findMany({ orderBy: { createdAt: 'desc' } });
    return rows.map((row) => PendingInvoiceMapper.toDomain(row));
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
