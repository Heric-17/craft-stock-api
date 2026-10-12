import type { PendingInvoice } from '../pending-invoice.entity';
import type { PendingInvoiceStatus } from '../pending-invoice-status.enum';

export const PENDING_INVOICE_REPOSITORY = Symbol('PENDING_INVOICE_REPOSITORY');

/** Filter and window of one page of the capture queue. */
export interface PendingInvoiceListQuery {
  status?: PendingInvoiceStatus;
  limit: number;
  offset: number;
}

/**
 * One page of the queue, newest first, with the size of the whole filtered set
 * beside it. The status filter is part of the query, not applied to the page.
 */
export interface PendingInvoicePage {
  invoices: PendingInvoice[];
  total: number;
  limit: number;
  offset: number;
}

export interface PendingInvoiceRepository {
  findById(id: string): Promise<PendingInvoice | null>;
  /**
   * One page of the queue — what the pending list screen shows. Ties on
   * `createdAt` are broken on `id`, so two captures made at the same instant
   * cannot swap places between pages and leave a row repeated or unreachable.
   */
  findPage(query: PendingInvoiceListQuery): Promise<PendingInvoicePage>;
  /**
   * An existing capture of the same URL, so scanning the same QR Code twice
   * resumes the capture already queued instead of stacking up duplicates.
   */
  findByUrl(url: string): Promise<PendingInvoice | null>;
  save(invoice: PendingInvoice): Promise<void>;
  delete(id: string): Promise<void>;
}
