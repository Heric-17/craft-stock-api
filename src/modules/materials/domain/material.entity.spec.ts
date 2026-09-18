import { Money } from '../../../shared/domain/money/money';
import { InvalidMaterialError } from './material.error';
import { Material, type MaterialProps } from './material.entity';

function buildProps(overrides: Partial<MaterialProps> = {}): MaterialProps {
  return {
    id: 'material-1',
    name: 'Farinha de trigo',
    description: null,
    imageUrl: null,
    packageCost: Money.fromDecimalString('10.00'),
    packageQuantity: 1000,
    stockQuantity: 500,
    minimumStockAlert: 100,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

describe('Material', () => {
  describe('unitCost', () => {
    it('computes the fractioned cost as packageCost divided by packageQuantity', () => {
      const material = new Material(
        buildProps({ packageCost: Money.fromDecimalString('10.00'), packageQuantity: 1000 }),
      );

      // R$ 10.00 for 1000g -> R$ 0.01 per gram.
      expect(material.unitCost.toCents()).toBe(1);
    });

    it('rounds when the division does not close on an exact cent', () => {
      const material = new Material(
        buildProps({ packageCost: Money.fromDecimalString('10.00'), packageQuantity: 3 }),
      );

      // 1000 cents / 3 = 333.33...cents, rounds to 333.
      expect(material.unitCost.toCents()).toBe(333);
    });

    it('reflects a packageCost correction instantly, with no stored value to invalidate', () => {
      const material = new Material(
        buildProps({ packageCost: Money.fromDecimalString('10.00'), packageQuantity: 1000 }),
      );
      const corrected = new Material(
        buildProps({ packageCost: Money.fromDecimalString('20.00'), packageQuantity: 1000 }),
      );

      expect(material.unitCost.toCents()).toBe(1);
      expect(corrected.unitCost.toCents()).toBe(2);
    });

    it('rejects a packageQuantity that is not greater than zero', () => {
      expect(() => new Material(buildProps({ packageQuantity: 0 }))).toThrow(InvalidMaterialError);
      expect(() => new Material(buildProps({ packageQuantity: -1 }))).toThrow(InvalidMaterialError);
    });
  });

  describe('isBelowMinimumStock', () => {
    it('is false when stock is above the minimum alert', () => {
      const material = new Material(buildProps({ stockQuantity: 500, minimumStockAlert: 100 }));

      expect(material.isBelowMinimumStock).toBe(false);
    });

    it('is true when stock equals the minimum alert', () => {
      const material = new Material(buildProps({ stockQuantity: 100, minimumStockAlert: 100 }));

      expect(material.isBelowMinimumStock).toBe(true);
    });

    it('is true when stock has dropped below the minimum alert', () => {
      const material = new Material(buildProps({ stockQuantity: 50, minimumStockAlert: 100 }));

      expect(material.isBelowMinimumStock).toBe(true);
    });

    it('rejects a negative stockQuantity', () => {
      expect(() => new Material(buildProps({ stockQuantity: -1 }))).toThrow(InvalidMaterialError);
    });
  });

  it('rejects an empty name', () => {
    expect(() => new Material(buildProps({ name: '  ' }))).toThrow(InvalidMaterialError);
  });
});
