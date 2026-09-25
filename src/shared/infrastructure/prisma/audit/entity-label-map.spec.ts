import { resolveEntityLabel } from './entity-label-map';

describe('resolveEntityLabel', () => {
  it.each([
    ['Material', { name: 'Flour' }, 'Flour'],
    ['CompositeProduct', { name: 'Cake' }, 'Cake'],
    ['Sale', { customerName: 'Alice' }, 'Alice'],
    ['Purchase', { merchantName: 'Bakery Supplies Co' }, 'Bakery Supplies Co'],
  ] as const)('resolves %s from its mapped field', (model, row, expected) => {
    expect(resolveEntityLabel(model, row)).toBe(expected);
  });

  it('returns null for a model absent from the map, without error', () => {
    expect(resolveEntityLabel('PendingInvoice', { url: 'https://example.com' })).toBeNull();
  });

  it('returns null when the row itself is null', () => {
    expect(resolveEntityLabel('Material', null)).toBeNull();
  });

  it('returns null when the mapped field is not a string', () => {
    expect(resolveEntityLabel('Material', { name: null })).toBeNull();
  });
});
