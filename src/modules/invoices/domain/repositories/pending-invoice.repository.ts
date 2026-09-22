import type { PendingInvoice } from '../pending-invoice.entity';
import type { PendingInvoiceStatus } from '../pending-invoice-status.enum';

export const PENDING_INVOICE_REPOSITORY = Symbol('PENDING_INVOICE_REPOSITORY');

export interface PendingInvoiceRepository {
  findById(id: string): Promise<PendingInvoice | null>;
  /** Polled by the NFC-e import job to pick up everything still awaiting processing. */
  findByStatus(status: PendingInvoiceStatus): Promise<PendingInvoice[]>;
  /** The whole queue, newest first — what the pending list screen shows. */
  findAll(): Promise<PendingInvoice[]>;
  /**
   * An existing capture of the same URL, so scanning the same QR Code twice
   * resumes the capture already queued instead of stacking up duplicates.
   */
  findByUrl(url: string): Promise<PendingInvoice | null>;
  save(invoice: PendingInvoice): Promise<void>;
  delete(id: string): Promise<void>;
}
