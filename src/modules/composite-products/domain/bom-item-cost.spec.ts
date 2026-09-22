import { randomUUID } from 'node:crypto';

import { Money } from '../../../shared/domain/money/money';
import { Material } from '../../materials/domain/material.entity';
import { BomItem } from './bom-item.entity';
import { calculateBomItemCost, calculateMaterialsCost } from './composite-product-pricing';

function material(packageCost: string, packageQuantity: number): Material {
  const now = new Date('2026-01-01T00:00:00Z');

  return new Material({
    id: randomUUID(),
    name: 'Insumo',
    description: null,
    imageUrl: null,
    packageCost: Money.fromDecimalString(packageCost),
    packageQuantity,
    consumptionUnit: 'GRAM',
    stockQuantity: 0,
    minimumStockAlert: 0,
    discontinuedAt: null,
    createdAt: now,
    updatedAt: now,
  });
}

function bomItem(quantity: number): BomItem {
  return new BomItem({
    id: randomUUID(),
    billOfMaterialsId: 'bom-1',
    materialId: 'material-1',
    quantity,
  });
}

/**
 * The precision check the whole fractional-cost model rests on.
 *
 * A `Material` bought at R$ 28,00 per 1 kg bag and consumed in grams costs
 * R$ 0,028 per gram — less than a cent. Rounding that to a cent before
 * multiplying it by the 120 g a recipe uses turns R$ 3,36 into R$ 3,60: a
 * 7% error, silently, on every line of every recipe with a fractional
 * ingredient. The error compounds across the bill of materials and lands in
 * the suggested price.
 */
describe('the cost of a BillOfMaterials line', () => {
  it('is exact for a Material costing less than a cent per consumption unit', () => {
    const flour = material('28.00', 1000);
    const line = bomItem(120);

    expect(
      calculateBomItemCost(
        flour.packageCost,
        line.quantity,
        flour.packageQuantity,
      ).toDecimalString(),
    ).toBe('3.36');
  });

  /**
   * The same figure, reached the way the reading side reaches it. If this
   * ever diverges from the line above, a screen is showing one number while
   * the pricing uses another.
   */
  it('matches what the materials cost sums to', () => {
    const flour = material('28.00', 1000);

    const cost = calculateMaterialsCost([
      {
        quantity: 120,
        packageCost: flour.packageCost,
        packageQuantity: flour.packageQuantity,
      },
    ]);

    expect(cost.toDecimalString()).toBe('3.36');
  });

  /**
   * Costs below a cent per unit are not an edge case — they are the ordinary
   * case for anything measured in grams, millilitres or centimetres.
   */
  describe('fractional costs below one cent per unit', () => {
    it.each([
      // packageCost, packageQuantity, quantity, expected
      ['28.00', 1000, 120, '3.36'], // R$ 0,028/g
      ['12.90', 1000, 250, '3.23'], // R$ 0,0129/g — 3,225 rounds to 3,23
      ['9.90', 1000, 1, '0.01'], // R$ 0,0099/g — a single gram still costs a cent
      ['4.50', 1000, 7, '0.03'], // R$ 0,0045/g — 0,0315 rounds to 0,03
      ['19.90', 2000, 500, '4.98'], // R$ 0,00995/ml — 4,975 rounds to 4,98
      ['3.00', 10000, 250, '0.08'], // R$ 0,0003/cm — 0,075 rounds to 0,08
      ['100.00', 1000000, 1000, '0.10'], // R$ 0,0001/mg
    ])(
      'R$ %s per %i units, consuming %i, costs R$ %s',
      (packageCost, packageQuantity, quantity, expected) => {
        expect(
          calculateBomItemCost(
            Money.fromDecimalString(packageCost),
            quantity,
            packageQuantity,
          ).toDecimalString(),
        ).toBe(expected);
      },
    );
  });

  /**
   * The whole point of multiplying before dividing: the error of rounding
   * each line to a cent first does not stay put, it accumulates down the
   * recipe.
   */
  it('does not accumulate rounding error across a long recipe', () => {
    const lines = Array.from({ length: 10 }, () => ({
      quantity: 120,
      packageCost: Money.fromDecimalString('28.00'),
      packageQuantity: 1000,
    }));

    // Ten lines of 3,36 — not ten lines of 3,60.
    expect(calculateMaterialsCost(lines).toDecimalString()).toBe('33.60');
  });

  it('is exact when the unit cost is a whole number of cents', () => {
    expect(
      calculateBomItemCost(Money.fromDecimalString('10.00'), 120, 1000).toDecimalString(),
    ).toBe('1.20');
  });

  it('rounds exactly once, half away from zero, at the end', () => {
    // 0,005 per unit × 3 = 0,015, which rounds up to 0,02 rather than down.
    expect(calculateBomItemCost(Money.fromDecimalString('5.00'), 3, 1000).toDecimalString()).toBe(
      '0.02',
    );
  });

  it('costs nothing when the Material itself costs nothing', () => {
    expect(calculateBomItemCost(Money.zero(), 120, 1000).isZero()).toBe(true);
  });
});
