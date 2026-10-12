import { Money } from '../../../shared/domain/money/money';
import { calculateLooseMaterialPriceBasis } from './loose-material-pricing';
import { InvalidSaleError } from './sale.error';

describe('calculateLooseMaterialPriceBasis', () => {
  it('returns the package cost untouched at a zero margin', () => {
    const basis = calculateLooseMaterialPriceBasis(Money.fromDecimalString('28.00'), 0);

    expect(basis.toDecimalString()).toBe('28.00');
  });

  it('marks the whole package up by the given basis points', () => {
    const basis = calculateLooseMaterialPriceBasis(Money.fromDecimalString('28.00'), 5000);

    expect(basis.toDecimalString()).toBe('42.00');
  });

  it('marks up the package, not a per-unit figure', () => {
    // A 1 kg package at R$ 10,00 with a 35% margin. Marking up the package
    // keeps the cent that a per-gram markup would have thrown away: R$ 0,01
    // per gram marked up to R$ 0,0135 has nowhere to go in whole cents.
    const basis = calculateLooseMaterialPriceBasis(Money.fromDecimalString('10.00'), 3500);

    expect(basis.toDecimalString()).toBe('13.50');
  });

  it('rounds the marked-up package price once, half away from zero', () => {
    // 1999 ¢ x 10700 / 10000 = 2138,93 ¢
    const basis = calculateLooseMaterialPriceBasis(Money.fromDecimalString('19.99'), 700);

    expect(basis.toDecimalString()).toBe('21.39');
  });

  it('rejects a negative margin, which would sell below cost by accident', () => {
    expect(() => calculateLooseMaterialPriceBasis(Money.fromDecimalString('28.00'), -1000)).toThrow(
      InvalidSaleError,
    );
  });

  it('marks up by 33,33% without a float in the way', () => {
    // 2800 ¢ x 13333 / 10000 = 3733,24 ¢
    const basis = calculateLooseMaterialPriceBasis(Money.fromDecimalString('28.00'), 3333);

    expect(basis.toDecimalString()).toBe('37.33');
  });

  it('rejects a margin that is a fraction of a basis point', () => {
    expect(() => calculateLooseMaterialPriceBasis(Money.fromDecimalString('28.00'), 33.33)).toThrow(
      InvalidSaleError,
    );
  });

  it('rejects a margin that is not a finite number', () => {
    expect(() =>
      calculateLooseMaterialPriceBasis(Money.fromDecimalString('28.00'), Number.NaN),
    ).toThrow(InvalidSaleError);
  });
});
