import { InvalidPendingInvoiceError } from './pending-invoice.error';
import type { PendingInvoiceStatus } from './pending-invoice-status.enum';

export interface PendingInvoiceProps {
  id: string;
  /** Captured NFC-e QR Code URL. */
  url: string;
  status: PendingInvoiceStatus;
  attemptCount: number;
  lastAttemptAt: Date | null;
  /** The `Purchase` this capture became, set when the import succeeded. */
  purchaseId: string | null;
  /** Why the last attempt failed, for the pending list. Never carries a stack. */
  lastError: string | null;
  createdAt: Date;
}

/**
 * A captured QR Code waiting to become a `Purchase`.
 *
 * This is the import queue, and it is a table rather than a broker on
 * purpose: it already has state, an attempt count and somewhere to resume
 * from. It is also what lets the note be scanned on a phone and the import be
 * finished at a desk — the capture outlives the request that created it.
 */
export class PendingInvoice {
  readonly id: string;
  readonly url: string;
  readonly status: PendingInvoiceStatus;
  readonly attemptCount: number;
  readonly lastAttemptAt: Date | null;
  readonly purchaseId: string | null;
  readonly lastError: string | null;
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

    if (props.status === 'IMPORTED' && props.purchaseId === null) {
      throw new InvalidPendingInvoiceError(
        'An imported PendingInvoice must reference the Purchase it produced.',
      );
    }

    this.id = props.id;
    this.url = props.url;
    this.status = props.status;
    this.attemptCount = props.attemptCount;
    this.lastAttemptAt = props.lastAttemptAt;
    this.purchaseId = props.purchaseId;
    this.lastError = props.lastError;
    this.createdAt = props.createdAt;
  }

  static capture(id: string, url: string, capturedAt: Date): PendingInvoice {
    return new PendingInvoice({
      id,
      url,
      status: 'PENDING',
      attemptCount: 0,
      lastAttemptAt: null,
      purchaseId: null,
      lastError: null,
      createdAt: capturedAt,
    });
  }

  get isImported(): boolean {
    return this.status === 'IMPORTED';
  }

  /**
   * The source did not answer. The capture is kept, the attempt is counted,
   * and the status says the portal is the problem — nothing about the note
   * itself is known yet, so there is something to come back to.
   */
  markUnstable(attemptedAt: Date, reason: string): PendingInvoice {
    return this.with({
      status: 'UNSTABLE',
      attemptCount: this.attemptCount + 1,
      lastAttemptAt: attemptedAt,
      lastError: reason,
    });
  }

  /**
   * The source answered, but not with a note we can read. The capture stays
   * `PENDING` rather than `UNSTABLE`: the portal is up, our parsing is what
   * broke, and it becomes retryable again the moment the scraper is fixed.
   */
  markUnreadable(attemptedAt: Date, reason: string): PendingInvoice {
    return this.with({
      status: 'PENDING',
      attemptCount: this.attemptCount + 1,
      lastAttemptAt: attemptedAt,
      lastError: reason,
    });
  }

  markImported(purchaseId: string, importedAt: Date): PendingInvoice {
    return this.with({
      status: 'IMPORTED',
      attemptCount: this.attemptCount + 1,
      lastAttemptAt: importedAt,
      purchaseId,
      lastError: null,
    });
  }

  private with(
    changes: Partial<Omit<PendingInvoiceProps, 'id' | 'url' | 'createdAt'>>,
  ): PendingInvoice {
    return new PendingInvoice({
      id: this.id,
      url: this.url,
      status: this.status,
      attemptCount: this.attemptCount,
      lastAttemptAt: this.lastAttemptAt,
      purchaseId: this.purchaseId,
      lastError: this.lastError,
      createdAt: this.createdAt,
      ...changes,
    });
  }
}
