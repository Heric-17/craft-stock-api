import { Money } from '../../../shared/domain/money/money';
import { calculateLooseMaterialPriceBasis } from './loose-material-pricing';
import { InvalidSaleError } from './sale.error';

describe('calculateLooseMaterialPriceBasis', () => {
  it('returns the package cost untouched at a zero margin', () => {
    const basis = calculateLooseMaterialPriceBasis(Money.fromDecimalString('28.00'), 0);

    expect(basis.toDecimalString()).toBe('28.00');
  });

  it('marks the whole package up by the given percentage', () => {
    const basis = calculateLooseMaterialPriceBasis(Money.fromDecimalString('28.00'), 50);

    expect(basis.toDecimalString()).toBe('42.00');
  });

  it('marks up the package, not a per-unit figure', () => {
    // A 1 kg package at R$ 10,00 with a 35% margin. Marking up the package
    // keeps the cent that a per-gram markup would have thrown away: R$ 0,01
    // per gram marked up to R$ 0,0135 has nowhere to go in whole cents.
    const basis = calculateLooseMaterialPriceBasis(Money.fromDecimalString('10.00'), 35);

    expect(basis.toDecimalString()).toBe('13.50');
  });

  it('rounds the marked-up package price once, half away from zero', () => {
    // 19.99 x 1.07 = 21.3893
    const basis = calculateLooseMaterialPriceBasis(Money.fromDecimalString('19.99'), 7);

    expect(basis.toDecimalString()).toBe('21.39');
  });

  it('rejects a negative margin, which would sell below cost by accident', () => {
    expect(() => calculateLooseMaterialPriceBasis(Money.fromDecimalString('28.00'), -10)).toThrow(
      InvalidSaleError,
    );
  });

  it('rejects a margin that is not a finite number', () => {
    expect(() =>
      calculateLooseMaterialPriceBasis(Money.fromDecimalString('28.00'), Number.NaN),
    ).toThrow(InvalidSaleError);
  });
});
