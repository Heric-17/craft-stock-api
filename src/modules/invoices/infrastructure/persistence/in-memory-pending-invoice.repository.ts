import type { PendingInvoice } from '../../domain/pending-invoice.entity';
import type { PendingInvoiceStatus } from '../../domain/pending-invoice-status.enum';
import type { PendingInvoiceRepository } from '../../domain/repositories/pending-invoice.repository';

/** In-memory `PendingInvoiceRepository` for `application/` tests. Never mocks Prisma. */
export class InMemoryPendingInvoiceRepository implements PendingInvoiceRepository {
  private readonly invoices = new Map<string, PendingInvoice>();

  async findById(id: string): Promise<PendingInvoice | null> {
    return Promise.resolve(this.invoices.get(id) ?? null);
  }

  async findByStatus(status: PendingInvoiceStatus): Promise<PendingInvoice[]> {
    return Promise.resolve(
      [...this.invoices.values()].filter((invoice) => invoice.status === status),
    );
  }

  async save(invoice: PendingInvoice): Promise<void> {
    this.invoices.set(invoice.id, invoice);
    return Promise.resolve();
  }

  async delete(id: string): Promise<void> {
    this.invoices.delete(id);
    return Promise.resolve();
  }
}
