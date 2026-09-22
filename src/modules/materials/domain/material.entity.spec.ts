import { Money } from '../../../shared/domain/money/money';
import { ConsumptionUnitLockedError, InvalidMaterialError } from './material.error';
import { Material, type MaterialProps } from './material.entity';

function buildProps(overrides: Partial<MaterialProps> = {}): MaterialProps {
  return {
    id: 'material-1',
    name: 'Farinha de trigo',
    description: null,
    imageUrl: null,
    packageCost: Money.fromDecimalString('10.00'),
    packageQuantity: 1000,
    consumptionUnit: 'GRAM',
    stockQuantity: 500,
    minimumStockAlert: 100,
    discontinuedAt: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

describe('Material', () => {
  describe('unitCost', () => {
    it('shows the fractioned cost as packageCost divided by packageQuantity', () => {
      const material = new Material(
        buildProps({ packageCost: Money.fromDecimalString('10.00'), packageQuantity: 1000 }),
      );

      // R$ 10.00 for 1000g -> R$ 0.01 per gram.
      expect(material.unitCost).toBe('0.0100');
    });

    /**
     * The display figure keeps the fraction of a cent that a `Money` cannot
     * hold. Showing R$ 0,03 per gram for a bag that costs R$ 0,028 per gram
     * is how the 7% error became invisible in the first place.
     */
    it('shows a cost below one cent per unit instead of rounding it away', () => {
      const material = new Material(
        buildProps({ packageCost: Money.fromDecimalString('28.00'), packageQuantity: 1000 }),
      );

      expect(material.unitCost).toBe('0.0280');
    });

    it('is a string, so it cannot be used as the base of a calculation', () => {
      const material = new Material(buildProps());

      expect(typeof material.unitCost).toBe('string');
    });

    it('rounds the display value when it does not close on an exact fraction', () => {
      const material = new Material(
        buildProps({ packageCost: Money.fromDecimalString('10.00'), packageQuantity: 3 }),
      );

      // 1000 cents / 3 = 333.33... cents -> R$ 3.3333 per unit.
      expect(material.unitCost).toBe('3.3333');
    });

    it('reflects a packageCost correction instantly, with no stored value to invalidate', () => {
      const material = new Material(
        buildProps({ packageCost: Money.fromDecimalString('10.00'), packageQuantity: 1000 }),
      );
      const corrected = new Material(
        buildProps({ packageCost: Money.fromDecimalString('20.00'), packageQuantity: 1000 }),
      );

      expect(material.unitCost).toBe('0.0100');
      expect(corrected.unitCost).toBe('0.0200');
    });
  });

  describe('costFor', () => {
    /**
     * The entry point every price is built from. It multiplies before
     * dividing and rounds once, so a fractional ingredient costs what it
     * costs rather than what a per-unit figure rounded to the cent implies.
     */
    it('is exact for a Material costing less than a cent per unit', () => {
      const flour = new Material(
        buildProps({ packageCost: Money.fromDecimalString('28.00'), packageQuantity: 1000 }),
      );

      expect(flour.costFor(120).toDecimalString()).toBe('3.36');
    });

    it('costs the whole package when the whole package is consumed', () => {
      const flour = new Material(
        buildProps({ packageCost: Money.fromDecimalString('28.00'), packageQuantity: 1000 }),
      );

      expect(flour.costFor(1000).toDecimalString()).toBe('28.00');
    });

    it('handles a fractional quantity', () => {
      const cheese = new Material(
        buildProps({ packageCost: Money.fromDecimalString('59.90'), packageQuantity: 1 }),
      );

      // 0.146 kg of a R$ 59,90/kg cheese.
      expect(cheese.costFor(0.146).toDecimalString()).toBe('8.75');
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

  describe('update', () => {
    it('applies the given changes and bumps updatedAt', () => {
      const material = new Material(
        buildProps({ name: 'Farinha', updatedAt: new Date('2026-01-01T00:00:00Z') }),
      );
      const updatedAt = new Date('2026-02-01T00:00:00Z');

      const updated = material.update({ name: 'Farinha de trigo especial' }, updatedAt);

      expect(updated.name).toBe('Farinha de trigo especial');
      expect(updated.updatedAt).toEqual(updatedAt);
      expect(updated).not.toBe(material);
    });

    it('leaves fields not present in changes untouched', () => {
      const material = new Material(buildProps({ stockQuantity: 500 }));

      const updated = material.update({ name: 'Novo nome' }, new Date());

      expect(updated.stockQuantity).toBe(500);
    });

    it('still enforces Material invariants on the resulting state', () => {
      const material = new Material(buildProps());

      expect(() => material.update({ stockQuantity: -1 }, new Date())).toThrow(
        InvalidMaterialError,
      );
    });
  });

  describe('withStockQuantity', () => {
    it('replaces the stock quantity and bumps updatedAt', () => {
      const material = new Material(buildProps({ stockQuantity: 100 }));
      const updatedAt = new Date('2026-03-01T00:00:00Z');

      const updated = material.withStockQuantity(150, updatedAt);

      expect(updated.stockQuantity).toBe(150);
      expect(updated.updatedAt).toEqual(updatedAt);
    });
  });

  describe('receiveInvoicePackageCost', () => {
    it('replaces packageCost when the reported value is greater than the current one', () => {
      const material = new Material(buildProps({ packageCost: Money.fromDecimalString('10.00') }));
      const updatedAt = new Date('2026-04-01T00:00:00Z');

      const updated = material.receiveInvoicePackageCost(
        Money.fromDecimalString('12.00'),
        updatedAt,
      );

      expect(updated.packageCost.equals(Money.fromDecimalString('12.00'))).toBe(true);
      expect(updated.updatedAt).toEqual(updatedAt);
    });

    it('keeps the current packageCost, and the same instance, when the reported value is not greater', () => {
      const material = new Material(buildProps({ packageCost: Money.fromDecimalString('10.00') }));

      const sameValue = material.receiveInvoicePackageCost(
        Money.fromDecimalString('10.00'),
        new Date(),
      );
      const lowerValue = material.receiveInvoicePackageCost(
        Money.fromDecimalString('8.00'),
        new Date(),
      );

      expect(sameValue).toBe(material);
      expect(lowerValue).toBe(material);
    });
  });

  describe('isActive / discontinue / reactivate', () => {
    it('is active by default (discontinuedAt is null)', () => {
      const material = new Material(buildProps());

      expect(material.isActive).toBe(true);
    });

    it('discontinue sets discontinuedAt and flips isActive', () => {
      const material = new Material(buildProps());
      const discontinuedAt = new Date('2026-02-01T00:00:00Z');

      const discontinued = material.discontinue(discontinuedAt);

      expect(discontinued.isActive).toBe(false);
      expect(discontinued.discontinuedAt).toEqual(discontinuedAt);
      expect(discontinued).not.toBe(material);
    });

    it('rejects discontinuing an already discontinued Material', () => {
      const material = new Material(
        buildProps({ discontinuedAt: new Date('2026-01-15T00:00:00Z') }),
      );

      expect(() => material.discontinue(new Date('2026-02-01T00:00:00Z'))).toThrow(
        InvalidMaterialError,
      );
    });

    it('reactivate clears discontinuedAt and flips isActive back', () => {
      const material = new Material(
        buildProps({ discontinuedAt: new Date('2026-01-15T00:00:00Z') }),
      );
      const updatedAt = new Date('2026-02-01T00:00:00Z');

      const reactivated = material.reactivate(updatedAt);

      expect(reactivated.isActive).toBe(true);
      expect(reactivated.discontinuedAt).toBeNull();
      expect(reactivated.updatedAt).toEqual(updatedAt);
    });

    it('rejects reactivating a Material that is already active', () => {
      const material = new Material(buildProps());

      expect(() => material.reactivate(new Date('2026-02-01T00:00:00Z'))).toThrow(
        InvalidMaterialError,
      );
    });
  });
  /**
   * The unit is what every quantity recorded against a Material *means*, so
   * it is frozen the moment any of them exists. Nothing is converted: a
   * Material holding 500 g that became `UNIT` would hold 500 units, and a
   * recipe asking for 120 of it would ask for 120 units. The resulting state
   * is wrong everywhere and looks perfectly normal, which is why this is
   * refused rather than migrated.
   */
  describe('changeConsumptionUnit', () => {
    const NO_USAGE = { bomItemReferences: 0 };
    const updatedAt = new Date('2026-03-01T00:00:00Z');

    it('switches the unit while there is no stock and no BomItem using it', () => {
      const material = new Material(
        buildProps({ consumptionUnit: 'UNIT', stockQuantity: 0, minimumStockAlert: 0 }),
      );

      const changed = material.changeConsumptionUnit('GRAM', NO_USAGE, updatedAt);

      expect(changed.consumptionUnit).toBe('GRAM');
      expect(changed.updatedAt).toEqual(updatedAt);
    });

    it('refuses to switch the unit of a Material that holds stock', () => {
      const material = new Material(buildProps({ consumptionUnit: 'UNIT', stockQuantity: 500 }));

      expect(() => material.changeConsumptionUnit('GRAM', NO_USAGE, updatedAt)).toThrow(
        ConsumptionUnitLockedError,
      );
    });

    it('refuses to switch the unit of a Material a BillOfMaterials line consumes', () => {
      const material = new Material(buildProps({ consumptionUnit: 'UNIT', stockQuantity: 0 }));

      expect(() =>
        material.changeConsumptionUnit('GRAM', { bomItemReferences: 1 }, updatedAt),
      ).toThrow(ConsumptionUnitLockedError);
    });

    /** Nothing changes meaning, so nothing is in the way. */
    it('accepts the unit it already has, even with stock and recipes in place', () => {
      const material = new Material(buildProps({ consumptionUnit: 'GRAM', stockQuantity: 500 }));

      const changed = material.changeConsumptionUnit('GRAM', { bomItemReferences: 3 }, updatedAt);

      expect(changed).toBe(material);
    });

    it('is the only way in: update() neither accepts nor applies a consumptionUnit', () => {
      const material = new Material(buildProps({ consumptionUnit: 'GRAM', stockQuantity: 500 }));

      // @ts-expect-error consumptionUnit is excluded from what update() accepts.
      const updated = material.update({ consumptionUnit: 'UNIT' }, updatedAt);

      expect(updated.consumptionUnit).toBe('GRAM');
    });
  });
});
