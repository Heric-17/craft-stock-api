import type { PendingInvoice } from '../pending-invoice.entity';
import type { PendingInvoiceStatus } from '../pending-invoice-status.enum';

export const PENDING_INVOICE_REPOSITORY = Symbol('PENDING_INVOICE_REPOSITORY');

export interface PendingInvoiceRepository {
  findById(id: string): Promise<PendingInvoice | null>;
  /** Polled by the NFC-e import job to pick up everything still awaiting processing. */
  findByStatus(status: PendingInvoiceStatus): Promise<PendingInvoice[]>;
  save(invoice: PendingInvoice): Promise<void>;
  delete(id: string): Promise<void>;
}
