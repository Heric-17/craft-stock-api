import { Prisma } from '../generated/client';
import { buildFieldChanges } from './build-field-changes';

describe('buildFieldChanges', () => {
  it('reports every field of the created row as old: null', () => {
    const changes = buildFieldChanges(null, { id: '1', name: 'Flour' });

    expect(changes).toEqual({
      id: { old: null, new: '1' },
      name: { old: null, new: 'Flour' },
    });
  });

  it('reports every field of the deleted row as new: null', () => {
    const changes = buildFieldChanges({ id: '1', name: 'Flour' }, null);

    expect(changes).toEqual({
      id: { old: '1', new: null },
      name: { old: 'Flour', new: null },
    });
  });

  it('reports only the fields that actually changed', () => {
    const before = { id: '1', name: 'Flour', stockQuantity: 100 };
    const after = { id: '1', name: 'Flour', stockQuantity: 80 };

    expect(buildFieldChanges(before, after)).toEqual({
      stockQuantity: { old: 100, new: 80 },
    });
  });

  it('returns no changes at all for an identical update', () => {
    const before = { id: '1', name: 'Flour', stockQuantity: 100 };
    const after = { id: '1', name: 'Flour', stockQuantity: 100 };

    expect(buildFieldChanges(before, after)).toEqual({});
  });

  it('ignores updatedAt even when it is the only field that differs', () => {
    const before = { id: '1', name: 'Flour', updatedAt: new Date('2026-01-01T00:00:00.000Z') };
    const after = { id: '1', name: 'Flour', updatedAt: new Date('2026-01-02T00:00:00.000Z') };

    expect(buildFieldChanges(before, after)).toEqual({});
  });

  it('still ignores updatedAt when a real field also changed', () => {
    const before = { name: 'Flour', updatedAt: new Date('2026-01-01T00:00:00.000Z') };
    const after = { name: 'Wheat Flour', updatedAt: new Date('2026-01-02T00:00:00.000Z') };

    expect(buildFieldChanges(before, after)).toEqual({
      name: { old: 'Flour', new: 'Wheat Flour' },
    });
  });

  it('compares Decimal fields by value, not by reference', () => {
    const before = { packageCost: new Prisma.Decimal('10.00') };
    const after = { packageCost: new Prisma.Decimal('10.00') };

    expect(buildFieldChanges(before, after)).toEqual({});
  });

  it('detects a real Decimal change and serializes both sides as strings', () => {
    // Decimal#toString() normalizes trailing zeros (10.00 -> "10") — exact,
    // just not fixed-precision. Fine for an investigation record; nothing
    // here is a base for calculation or user-facing display (§8.1 does not
    // apply to this diff).
    const before = { packageCost: new Prisma.Decimal('10.00') };
    const after = { packageCost: new Prisma.Decimal('12.50') };

    expect(buildFieldChanges(before, after)).toEqual({
      packageCost: { old: '10', new: '12.5' },
    });
  });

  it('compares Date fields by value, not by reference', () => {
    const before = { discontinuedAt: new Date('2026-01-01T00:00:00.000Z') };
    const after = { discontinuedAt: new Date('2026-01-01T00:00:00.000Z') };

    expect(buildFieldChanges(before, after)).toEqual({});
  });

  it('serializes a changed Date as an ISO string', () => {
    const before = { discontinuedAt: null };
    const after = { discontinuedAt: new Date('2026-01-01T00:00:00.000Z') };

    expect(buildFieldChanges(before, after)).toEqual({
      discontinuedAt: { old: null, new: '2026-01-01T00:00:00.000Z' },
    });
  });

  it('compares nested JSON objects by content, not by reference', () => {
    const before = { rawInvoiceData: { items: [{ code: 'A1', qty: 2 }] } };
    const after = { rawInvoiceData: { items: [{ code: 'A1', qty: 2 }] } };

    expect(buildFieldChanges(before, after)).toEqual({});
  });

  it('detects a real change inside nested JSON', () => {
    const before = { rawInvoiceData: { items: [{ code: 'A1', qty: 2 }] } };
    const after = { rawInvoiceData: { items: [{ code: 'A1', qty: 3 }] } };

    expect(buildFieldChanges(before, after)).toEqual({
      rawInvoiceData: {
        old: { items: [{ code: 'A1', qty: 2 }] },
        new: { items: [{ code: 'A1', qty: 3 }] },
      },
    });
  });
});
