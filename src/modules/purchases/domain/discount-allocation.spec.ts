import { Money } from '../../../shared/domain/money/money';
import { allocateNetValues, type DiscountAllocationLine } from './discount-allocation';
import { InvalidPurchaseError } from './purchase.error';

function line(id: string, grossValue: string): DiscountAllocationLine {
  return { id, grossValue: Money.fromDecimalString(grossValue) };
}

function sumOf(values: readonly { netValue: Money }[]): Money {
  return values.reduce((total, value) => total.plus(value.netValue), Money.zero());
}

describe('allocateNetValues', () => {
  it('leaves every line untouched when the note has no discount', () => {
    const lines = [line('a', '10.00'), line('b', '5.33')];

    const allocated = allocateNetValues(
      lines,
      Money.fromDecimalString('15.33'),
      Money.fromDecimalString('15.33'),
    );

    expect(allocated.map((item) => item.netValue.toDecimalString())).toEqual(['10.00', '5.33']);
  });

  it('spreads the discount proportionally to each line gross value', () => {
    const lines = [line('a', '80.00'), line('b', '20.00')];

    const allocated = allocateNetValues(
      lines,
      Money.fromDecimalString('100.00'),
      Money.fromDecimalString('90.00'),
    );

    expect(allocated.map((item) => item.netValue.toDecimalString())).toEqual(['72.00', '18.00']);
  });

  it('closes the rounding residue against netTotal', () => {
    // Three lines at a third of full price, two of which round the same way:
    // the apportioned values overshoot what was paid by a cent before the
    // residue is applied.
    const lines = [line('a', '5.00'), line('b', '5.00'), line('c', '20.00')];

    const allocated = allocateNetValues(
      lines,
      Money.fromDecimalString('30.00'),
      Money.fromDecimalString('10.00'),
    );

    expect(allocated.map((item) => item.netValue.toDecimalString())).toEqual([
      '1.67',
      '1.67',
      '6.66',
    ]);
    expect(sumOf(allocated).toDecimalString()).toBe('10.00');
  });

  it('adds up to exactly netTotal across many uneven lines', () => {
    const lines = [
      line('a', '3.33'),
      line('b', '7.77'),
      line('c', '1.11'),
      line('d', '19.99'),
      line('e', '0.07'),
    ];
    const grossTotal = sumOf(lines.map((item) => ({ netValue: item.grossValue })));
    const netTotal = grossTotal.minus(Money.fromDecimalString('4.44'));

    const allocated = allocateNetValues(lines, grossTotal, netTotal);

    expect(sumOf(allocated).toDecimalString()).toBe(netTotal.toDecimalString());
  });

  it('throws the residue at the largest line, not at the small ones', () => {
    // Five lines of 1.00 and one of 3.00, at 7/8 of full price: every line
    // rounds half a cent up, for three cents more than the note was paid at.
    const lines = [
      line('small-1', '1.00'),
      line('small-2', '1.00'),
      line('small-3', '1.00'),
      line('small-4', '1.00'),
      line('small-5', '1.00'),
      line('large', '3.00'),
    ];

    const allocated = allocateNetValues(
      lines,
      Money.fromDecimalString('8.00'),
      Money.fromDecimalString('7.00'),
    );
    const byId = new Map(allocated.map((item) => [item.id, item.netValue.toDecimalString()]));

    expect(byId.get('small-1')).toBe('0.88');
    expect(byId.get('small-5')).toBe('0.88');
    expect(byId.get('large')).toBe('2.60');
    expect(sumOf(allocated).toDecimalString()).toBe('7.00');
  });

  it('keeps gross values when the whole note was free, instead of dividing by zero', () => {
    const lines = [line('a', '0.00'), line('b', '0.00')];

    const allocated = allocateNetValues(lines, Money.zero(), Money.zero());

    expect(allocated.map((item) => item.netValue.toDecimalString())).toEqual(['0.00', '0.00']);
  });

  it('returns nothing for a note with no lines', () => {
    expect(
      allocateNetValues([], Money.fromDecimalString('10.00'), Money.fromDecimalString('9.00')),
    ).toEqual([]);
  });

  it('rejects a netTotal above the grossTotal', () => {
    expect(() =>
      allocateNetValues(
        [line('a', '10.00')],
        Money.fromDecimalString('10.00'),
        Money.fromDecimalString('11.00'),
      ),
    ).toThrow(InvalidPurchaseError);
  });

  it('rejects negative totals', () => {
    expect(() =>
      allocateNetValues(
        [line('a', '10.00')],
        Money.fromDecimalString('10.00'),
        Money.fromDecimalString('-1.00'),
      ),
    ).toThrow(InvalidPurchaseError);
  });
});
