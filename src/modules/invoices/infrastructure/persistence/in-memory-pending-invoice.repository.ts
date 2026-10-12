import type { PendingInvoice } from '../../domain/pending-invoice.entity';
import type {
  PendingInvoiceListQuery,
  PendingInvoicePage,
  PendingInvoiceRepository,
} from '../../domain/repositories/pending-invoice.repository';

/** In-memory `PendingInvoiceRepository` for `application/` tests. Never mocks Prisma. */
export class InMemoryPendingInvoiceRepository implements PendingInvoiceRepository {
  private readonly invoices = new Map<string, PendingInvoice>();

  async findById(id: string): Promise<PendingInvoice | null> {
    return Promise.resolve(this.invoices.get(id) ?? null);
  }

  /** Same filter and same order as the Prisma one: newest first, ties broken on id. */
  async findPage(query: PendingInvoiceListQuery): Promise<PendingInvoicePage> {
    const matching = [...this.invoices.values()]
      .filter((invoice) => query.status === undefined || invoice.status === query.status)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.id.localeCompare(a.id));

    return Promise.resolve({
      invoices: matching.slice(query.offset, query.offset + query.limit),
      total: matching.length,
      limit: query.limit,
      offset: query.offset,
    });
  }

  async findByUrl(url: string): Promise<PendingInvoice | null> {
    return Promise.resolve(
      [...this.invoices.values()].find((invoice) => invoice.url === url) ?? null,
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
