import { InvalidPendingInvoiceError } from './pending-invoice.error';
import { PendingInvoice } from './pending-invoice.entity';

function build(
  overrides: Partial<ConstructorParameters<typeof PendingInvoice>[0]> = {},
): PendingInvoice {
  return new PendingInvoice({
    id: 'invoice-1',
    url: 'https://www.sefaz.example/qrcode?p=1234',
    status: 'PENDING',
    attemptCount: 0,
    lastAttemptAt: null,
    purchaseId: null,
    lastError: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  });
}

describe('PendingInvoice', () => {
  it('builds with the captured url and default status', () => {
    const invoice = build();

    expect(invoice.status).toBe('PENDING');
    expect(invoice.attemptCount).toBe(0);
  });

  it('rejects an empty url', () => {
    expect(() => build({ url: ' ' })).toThrow(InvalidPendingInvoiceError);
  });

  it('rejects a negative attemptCount', () => {
    expect(() => build({ attemptCount: -1 })).toThrow(InvalidPendingInvoiceError);
  });

  it('captures a scanned url as a fresh queue entry', () => {
    const captured = PendingInvoice.capture('id', 'https://x.example/p', new Date());

    expect(captured.status).toBe('PENDING');
    expect(captured.attemptCount).toBe(0);
    expect(captured.purchaseId).toBeNull();
  });

  /**
   * The source did not answer, so nothing is known about the note itself.
   * The capture survives with its attempt counted, which is what the pending
   * list offers to retry.
   */
  it('parks a capture as UNSTABLE when the portal did not answer', () => {
    const parked = build().markUnstable(new Date('2026-01-02T00:00:00Z'), 'socket hang up');

    expect(parked.status).toBe('UNSTABLE');
    expect(parked.attemptCount).toBe(1);
    expect(parked.lastError).toBe('socket hang up');
    expect(parked.lastAttemptAt).toEqual(new Date('2026-01-02T00:00:00Z'));
  });

  /**
   * The portal is up and our parsing is what broke, so the capture stays
   * PENDING rather than UNSTABLE: it becomes retryable the moment the scraper
   * is fixed, without anyone having to move it back by hand.
   */
  it('keeps a structurally unreadable capture PENDING rather than UNSTABLE', () => {
    const kept = build().markUnreadable(new Date(), 'markers absent');

    expect(kept.status).toBe('PENDING');
    expect(kept.attemptCount).toBe(1);
    expect(kept.lastError).toBe('markers absent');
  });

  it('closes a capture against the purchase it produced', () => {
    const imported = build().markImported('purchase-1', new Date());

    expect(imported.status).toBe('IMPORTED');
    expect(imported.purchaseId).toBe('purchase-1');
    expect(imported.isImported).toBe(true);
    expect(imported.lastError).toBeNull();
  });

  it('refuses to be imported without naming the purchase it became', () => {
    expect(() => build({ status: 'IMPORTED', purchaseId: null })).toThrow(
      InvalidPendingInvoiceError,
    );
  });

  it('counts attempts across successive failures', () => {
    const twice = build().markUnstable(new Date(), 'first').markUnstable(new Date(), 'second');

    expect(twice.attemptCount).toBe(2);
    expect(twice.lastError).toBe('second');
  });
});
