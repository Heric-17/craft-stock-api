import { InMemoryUnitOfWork } from '../../../../shared/infrastructure/persistence/in-memory-unit-of-work';
import type { RepositoryContext } from '../../../../shared/domain/persistence/unit-of-work';
import { PendingInvoice } from '../../domain/pending-invoice.entity';
import type { PendingInvoiceStatus } from '../../domain/pending-invoice-status.enum';
import { InMemoryPendingInvoiceRepository } from '../../infrastructure/persistence/in-memory-pending-invoice.repository';
import { PendingInvoicesService } from './pending-invoices.service';

function capture(id: string, status: PendingInvoiceStatus, createdAt: Date): PendingInvoice {
  return new PendingInvoice({
    id,
    url: `https://nfce.example/?p=${id}`,
    status,
    attemptCount: 0,
    lastAttemptAt: null,
    purchaseId: status === 'IMPORTED' ? 'purchase-1' : null,
    lastError: null,
    createdAt,
  });
}

function buildService() {
  const pendingInvoices = new InMemoryPendingInvoiceRepository();
  const unitOfWork = new InMemoryUnitOfWork({ pendingInvoices } as unknown as RepositoryContext);

  return { service: new PendingInvoicesService(unitOfWork), pendingInvoices };
}

describe('PendingInvoicesService.list', () => {
  it('pages the queue newest first and reports the size of the whole set', async () => {
    const { service, pendingInvoices } = buildService();
    await pendingInvoices.save(capture('a', 'PENDING', new Date('2026-01-01T10:00:00Z')));
    await pendingInvoices.save(capture('b', 'PENDING', new Date('2026-01-03T10:00:00Z')));
    await pendingInvoices.save(capture('c', 'PENDING', new Date('2026-01-02T10:00:00Z')));

    const first = await service.list({ limit: 2, offset: 0 });
    const second = await service.list({ limit: 2, offset: 2 });

    expect(first.items.map((invoice) => invoice.id)).toEqual(['b', 'c']);
    expect(second.items.map((invoice) => invoice.id)).toEqual(['a']);
    expect(first).toMatchObject({ total: 3, limit: 2, offset: 0 });
  });

  it('breaks a tie on the id, so captures made at the same instant keep their place', async () => {
    const { service, pendingInvoices } = buildService();
    const instant = new Date('2026-01-01T10:00:00Z');
    for (const id of ['m', 'z', 'a', 'q']) {
      await pendingInvoices.save(capture(id, 'PENDING', instant));
    }

    const first = await service.list({ limit: 2, offset: 0 });
    const second = await service.list({ limit: 2, offset: 2 });

    expect([...first.items, ...second.items].map((invoice) => invoice.id)).toEqual([
      'z',
      'q',
      'm',
      'a',
    ]);
  });

  it('filters by status inside the query, so the total counts the filtered set', async () => {
    const { service, pendingInvoices } = buildService();
    await pendingInvoices.save(capture('a', 'UNSTABLE', new Date('2026-01-01T10:00:00Z')));
    await pendingInvoices.save(capture('b', 'PENDING', new Date('2026-01-02T10:00:00Z')));
    await pendingInvoices.save(capture('c', 'UNSTABLE', new Date('2026-01-03T10:00:00Z')));

    const page = await service.list({ status: 'UNSTABLE', limit: 1, offset: 0 });

    expect(page.items.map((invoice) => invoice.id)).toEqual(['c']);
    expect(page.total).toBe(2);
  });

  it('answers an offset past the total with an empty page', async () => {
    const { service, pendingInvoices } = buildService();
    await pendingInvoices.save(capture('a', 'PENDING', new Date('2026-01-01T10:00:00Z')));

    const page = await service.list({ limit: 10, offset: 50 });

    expect(page).toMatchObject({ items: [], total: 1, offset: 50 });
  });
});
