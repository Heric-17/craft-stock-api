import { DomainError } from '../../../shared/domain/errors/domain.error';

/**
 * The note behind this access key was already imported. Carries the existing
 * `Purchase` so the caller can point the user at it instead of creating a
 * second record of the same purchase.
 */
export class DuplicateInvoiceError extends DomainError {
  constructor(
    readonly accessKey: string,
    readonly existingPurchaseId: string,
  ) {
    super(
      `Invoice ${accessKey} was already imported as Purchase ${existingPurchaseId}. It was not imported again.`,
    );
  }
}

/**
 * The state portal did not answer, or answered with a server-side failure.
 * There is no HTML to look at, so nothing can be said about the note itself —
 * the capture stays queued and is retried later.
 */
export class InvoiceSourceUnavailableError extends DomainError {
  constructor(
    message: string,
    readonly attempts: number,
  ) {
    super(message);
  }
}

/**
 * The portal answered, but the page does not carry the structure the scraper
 * was written against: a marker is missing, a field that must be there is
 * absent, or a value cannot be read as a number.
 *
 * This is the alarm for the scraping having broken — the portal changed its
 * markup — and is deliberately never swallowed into a default value. A zero
 * substituted for an unreadable price would travel silently into
 * `packageCost`, into `unitCost`, and from there into the suggested price of
 * every `CompositeProduct` that consumes the Material, with nothing anywhere
 * reporting a failure.
 */
export class InvoiceStructureChangedError extends DomainError {
  constructor(
    message: string,
    readonly url: string | null = null,
  ) {
    super(message);
  }
}

/** The URL does not resolve to a federal unit any provider was written for. */
export class UnsupportedFederalUnitError extends DomainError {}

/** The transport itself failed: no response, or a response that never carried a body. */
export class HttpTransportError extends DomainError {
  constructor(
    message: string,
    readonly transportFailure?: unknown,
  ) {
    super(message);
  }
}
