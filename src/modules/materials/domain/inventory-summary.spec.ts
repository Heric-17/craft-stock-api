import { Money } from '../../../shared/domain/money/money';
import { summarizeInventory } from './inventory-summary';
import { Material } from './material.entity';

function material(
  overrides: Partial<ConstructorParameters<typeof Material>[0]> & { id: string },
): Material {
  const now = new Date('2026-01-01T00:00:00Z');

  return new Material({
    name: `Insumo ${overrides.id}`,
    description: null,
    imageKey: null,
    packageCost: Money.fromDecimalString('10.00'),
    packageQuantity: 3,
    consumptionUnit: 'GRAM',
    stockQuantity: 1,
    minimumStockAlert: 0,
    discontinuedAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  });
}

describe('Material.stockValue', () => {
  it('multiplies before dividing: 500 g of a 1 kg bag at 28.00 is 14.00', () => {
    const flour = material({
      id: 'flour',
      packageCost: Money.fromDecimalString('28.00'),
      packageQuantity: 1000,
      stockQuantity: 500,
    });

    expect(flour.stockValue.toDecimalString()).toBe('14.00');
  });

  it('rounds to the cent for this Material, half away from zero', () => {
    // 5.00 x 3 / 1000 = 1.5 cents exactly -> 2 cents.
    const material1 = material({
      id: 'm',
      packageCost: Money.fromDecimalString('5.00'),
      packageQuantity: 1000,
      stockQuantity: 3,
    });

    expect(material1.stockValue.toDecimalString()).toBe('0.02');
  });

  it('is zero with no stock', () => {
    expect(material({ id: 'empty', stockQuantity: 0 }).stockValue.isZero()).toBe(true);
  });
});

describe('summarizeInventory', () => {
  /**
   * Three Materials, each with 1 g of a 3 g package at R$ 10,00.
   *
   * - CORRECT, 9.99: each Material is worth 3.33 once rounded to the cent,
   *   which is the figure on its row in the list, and the total adds the rows.
   * - WRONG, 10.00: adding the exact thirds (3 x 3.3333…) and rounding once at
   *   the end. It is a cent more than the rows above it add up to.
   */
  const three = ['a', 'b', 'c'].map((id) => material({ id }));

  it('rounds each Material before adding, so the total equals its rows', () => {
    const summary = summarizeInventory(three);

    expect(summary.totalStockValue.toDecimalString()).toBe('9.99');
    expect(three.map((m) => m.stockValue.toDecimalString())).toEqual(['3.33', '3.33', '3.33']);
  });

  it('differs from rounding the exact sum at the end, which is why the order matters', () => {
    const exactSumRoundedOnce = Money.fromDecimalString('10.00').scaled(3, 3);

    expect(exactSumRoundedOnce.toDecimalString()).toBe('10.00');
    expect(summarizeInventory(three).totalStockValue.equals(exactSumRoundedOnce)).toBe(false);
  });

  it('counts the Materials at or below their minimum alert', () => {
    const summary = summarizeInventory([
      material({ id: 'below', stockQuantity: 2, minimumStockAlert: 5 }),
      material({ id: 'exactly', stockQuantity: 5, minimumStockAlert: 5 }),
      material({ id: 'above', stockQuantity: 6, minimumStockAlert: 5 }),
    ]);

    expect(summary.materialCount).toBe(3);
    expect(summary.belowMinimumCount).toBe(2);
  });

  it('is all zeros for no Materials', () => {
    const summary = summarizeInventory([]);

    expect(summary.materialCount).toBe(0);
    expect(summary.belowMinimumCount).toBe(0);
    expect(summary.totalStockValue.isZero()).toBe(true);
  });
});
