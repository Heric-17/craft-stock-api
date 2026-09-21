import { Money } from '../../../shared/domain/money/money';
import { InvalidPurchaseError } from './purchase.error';
import { Purchase } from './purchase.entity';

function build(overrides: Partial<ConstructorParameters<typeof Purchase>[0]> = {}): Purchase {
  return new Purchase({
    id: 'purchase-1',
    purchaseDate: new Date('2026-01-01T00:00:00Z'),
    accessKey: null,
    rawInvoiceData: null,
    grossTotal: Money.fromDecimalString('100.00'),
    discountTotal: Money.zero(),
    netTotal: Money.fromDecimalString('100.00'),
    createdAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  });
}

describe('Purchase', () => {
  it('accepts a manual purchase with no accessKey', () => {
    expect(build().accessKey).toBeNull();
  });

  it('accepts a 44-digit accessKey', () => {
    const accessKey = '1'.repeat(44);

    expect(build({ accessKey, rawInvoiceData: { items: [] } }).accessKey).toBe(accessKey);
  });

  it('rejects an accessKey that is not exactly 44 digits', () => {
    expect(() => build({ accessKey: '12345' })).toThrow(InvalidPurchaseError);
  });

  it('keeps the three totals of a discounted note', () => {
    const purchase = build({
      grossTotal: Money.fromDecimalString('100.00'),
      discountTotal: Money.fromDecimalString('12.34'),
      netTotal: Money.fromDecimalString('87.66'),
    });

    expect(purchase.grossTotal.toDecimalString()).toBe('100.00');
    expect(purchase.discountTotal.toDecimalString()).toBe('12.34');
    expect(purchase.netTotal.toDecimalString()).toBe('87.66');
    expect(purchase.hasDiscount).toBe(true);
  });

  it('reports no discount when the note granted none', () => {
    expect(build().hasDiscount).toBe(false);
  });

  it('rejects a netTotal that does not close against grossTotal and discountTotal', () => {
    expect(() =>
      build({
        discountTotal: Money.fromDecimalString('10.00'),
        netTotal: Money.fromDecimalString('95.00'),
      }),
    ).toThrow(InvalidPurchaseError);
  });

  it('rejects a discount larger than the note itself', () => {
    expect(() =>
      build({
        discountTotal: Money.fromDecimalString('150.00'),
        netTotal: Money.fromDecimalString('-50.00'),
      }),
    ).toThrow(InvalidPurchaseError);
  });

  it('rejects negative totals', () => {
    expect(() => build({ discountTotal: Money.fromDecimalString('-1.00') })).toThrow(
      InvalidPurchaseError,
    );
  });
});
