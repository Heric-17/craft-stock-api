import { InvalidPurchaseError } from './purchase.error';
import { Purchase } from './purchase.entity';

describe('Purchase', () => {
  it('accepts a manual purchase with no accessKey', () => {
    const purchase = new Purchase({
      id: 'purchase-1',
      purchaseDate: new Date('2026-01-01T00:00:00Z'),
      accessKey: null,
      rawInvoiceData: null,
      createdAt: new Date('2026-01-01T00:00:00Z'),
    });

    expect(purchase.accessKey).toBeNull();
  });

  it('accepts a 44-digit accessKey', () => {
    const accessKey = '1'.repeat(44);

    const purchase = new Purchase({
      id: 'purchase-1',
      purchaseDate: new Date('2026-01-01T00:00:00Z'),
      accessKey,
      rawInvoiceData: { items: [] },
      createdAt: new Date('2026-01-01T00:00:00Z'),
    });

    expect(purchase.accessKey).toBe(accessKey);
  });

  it('rejects an accessKey that is not exactly 44 digits', () => {
    expect(
      () =>
        new Purchase({
          id: 'purchase-1',
          purchaseDate: new Date('2026-01-01T00:00:00Z'),
          accessKey: '12345',
          rawInvoiceData: null,
          createdAt: new Date('2026-01-01T00:00:00Z'),
        }),
    ).toThrow(InvalidPurchaseError);
  });
});
