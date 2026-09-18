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
});
