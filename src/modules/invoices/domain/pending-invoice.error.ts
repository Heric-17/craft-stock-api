import { DomainError } from '../../../shared/domain/errors/domain.error';

/** Raised when a `PendingInvoice` is constructed with an invalid invariant. */
export class InvalidPendingInvoiceError extends DomainError {}
