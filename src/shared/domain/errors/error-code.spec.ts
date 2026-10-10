import { toErrorCode } from './error-code';

describe('toErrorCode', () => {
  it.each([
    ['EntityInUseError', 'ENTITY_IN_USE'],
    ['ConsumptionUnitLockedError', 'CONSUMPTION_UNIT_LOCKED'],
    ['DuplicateInvoiceError', 'DUPLICATE_INVOICE'],
    ['InvalidRefreshTokenError', 'INVALID_REFRESH_TOKEN'],
    ['DiscountAllocationError', 'DISCOUNT_ALLOCATION'],
    ['PendingDiscountAllocationError', 'PENDING_DISCOUNT_ALLOCATION'],
    ['InvoiceStructureChangedError', 'INVOICE_STRUCTURE_CHANGED'],
  ])('maps %s to %s', (className, expected) => {
    expect(toErrorCode(className)).toBe(expected);
  });

  /** `Http` must not become `H_T_T_P`. */
  it('keeps an acronym whole', () => {
    expect(toErrorCode('HttpTransportError')).toBe('HTTP_TRANSPORT');
  });

  it('leaves a name that does not end in Error alone apart from the casing', () => {
    expect(toErrorCode('SomethingOdd')).toBe('SOMETHING_ODD');
  });

  it('is upper snake case throughout, which is what the contract promises', () => {
    expect(toErrorCode('InvalidStockEntryError')).toMatch(/^[A-Z][A-Z0-9_]*$/);
  });

  /** Defensive: a class literally named `Error` still yields something usable. */
  it('falls back rather than returning an empty code', () => {
    expect(toErrorCode('Error')).toBe('DOMAIN');
  });
});
