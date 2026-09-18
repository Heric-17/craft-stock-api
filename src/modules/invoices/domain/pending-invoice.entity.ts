import { InvalidPendingInvoiceError } from './pending-invoice.error';
import type { PendingInvoiceStatus } from './pending-invoice-status.enum';

export interface PendingInvoiceProps {
  id: string;
  /** Captured NFC-e QR Code URL. */
  url: string;
  status: PendingInvoiceStatus;
  attemptCount: number;
  lastAttemptAt: Date | null;
  createdAt: Date;
}

export class PendingInvoice {
  readonly id: string;
  readonly url: string;
  readonly status: PendingInvoiceStatus;
  readonly attemptCount: number;
  readonly lastAttemptAt: Date | null;
  readonly createdAt: Date;

  constructor(props: PendingInvoiceProps) {
    if (props.url.trim().length === 0) {
      throw new InvalidPendingInvoiceError('PendingInvoice url must not be empty.');
    }

    if (!Number.isInteger(props.attemptCount) || props.attemptCount < 0) {
      throw new InvalidPendingInvoiceError(
        'PendingInvoice attemptCount must be an integer greater than or equal to zero.',
      );
    }

    this.id = props.id;
    this.url = props.url;
    this.status = props.status;
    this.attemptCount = props.attemptCount;
    this.lastAttemptAt = props.lastAttemptAt;
    this.createdAt = props.createdAt;
  }
}
