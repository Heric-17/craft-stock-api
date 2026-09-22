import { InvalidMoneyOperationError } from './money.error';
import { Money } from './money';

describe('Money', () => {
  describe('zero', () => {
    it('creates a zero amount', () => {
      expect(Money.zero().toCents()).toBe(0);
      expect(Money.zero().toNumber()).toBe(0);
    });
  });

  describe('fromCents', () => {
    it('accepts an integer number of cents', () => {
      expect(Money.fromCents(1990).toCents()).toBe(1990);
    });

    it('rejects a non-integer number of cents', () => {
      expect(() => Money.fromCents(19.5)).toThrow(InvalidMoneyOperationError);
    });
  });

  describe('fromDecimalString', () => {
    it('parses a plain decimal amount', () => {
      expect(Money.fromDecimalString('19.90').toCents()).toBe(1990);
    });

    it('parses an integer amount with no fractional part', () => {
      expect(Money.fromDecimalString('42').toCents()).toBe(4200);
    });

    it('parses a negative amount', () => {
      expect(Money.fromDecimalString('-3.45').toCents()).toBe(-345);
    });

    it('rounds half away from zero past the cent, for positive amounts', () => {
      expect(Money.fromDecimalString('10.005').toCents()).toBe(1001);
      expect(Money.fromDecimalString('10.004').toCents()).toBe(1000);
    });

    it('rounds half away from zero past the cent, for negative amounts', () => {
      expect(Money.fromDecimalString('-10.005').toCents()).toBe(-1001);
      expect(Money.fromDecimalString('-10.004').toCents()).toBe(-1000);
    });

    it('rejects a malformed decimal string', () => {
      expect(() => Money.fromDecimalString('not-a-number')).toThrow(InvalidMoneyOperationError);
      expect(() => Money.fromDecimalString('1.2.3')).toThrow(InvalidMoneyOperationError);
      expect(() => Money.fromDecimalString('')).toThrow(InvalidMoneyOperationError);
    });
  });

  describe('plus / minus', () => {
    it('adds and subtracts exactly, as integer cents', () => {
      const a = Money.fromCents(1000);
      const b = Money.fromCents(333);

      expect(a.plus(b).toCents()).toBe(1333);
      expect(a.minus(b).toCents()).toBe(667);
    });
  });

  describe('times', () => {
    it('multiplies by a whole factor exactly', () => {
      expect(Money.fromCents(500).times(3).toCents()).toBe(1500);
    });

    it('rounds the result when the factor produces a fractional cent', () => {
      // 500 * 0.333 = 166.5 cents, rounds half up to 167.
      expect(Money.fromCents(500).times(0.333).toCents()).toBe(167);
    });

    it('rejects a non-finite factor', () => {
      expect(() => Money.fromCents(500).times(NaN)).toThrow(InvalidMoneyOperationError);
      expect(() => Money.fromCents(500).times(Infinity)).toThrow(InvalidMoneyOperationError);
    });
  });

  describe('dividedBy', () => {
    it('divides exactly when the result closes on a whole cent', () => {
      expect(Money.fromCents(900).dividedBy(3).toCents()).toBe(300);
    });

    it('rounds when the fractional cost does not close in an exact cent', () => {
      // 1000 cents / 6 = 166.66...cents, rounds to 167.
      expect(Money.fromCents(1000).dividedBy(6).toCents()).toBe(167);
    });

    it('rejects division by zero', () => {
      expect(() => Money.fromCents(1000).dividedBy(0)).toThrow(InvalidMoneyOperationError);
    });

    it('rejects a non-finite divisor', () => {
      expect(() => Money.fromCents(1000).dividedBy(NaN)).toThrow(InvalidMoneyOperationError);
    });
  });

  describe('comparisons', () => {
    it('compares two amounts', () => {
      const a = Money.fromCents(1000);
      const b = Money.fromCents(2000);

      expect(a.equals(Money.fromCents(1000))).toBe(true);
      expect(a.isLessThan(b)).toBe(true);
      expect(b.isGreaterThan(a)).toBe(true);
      expect(a.isLessThanOrEqual(Money.fromCents(1000))).toBe(true);
      expect(b.isGreaterThanOrEqual(Money.fromCents(2000))).toBe(true);
    });

    it('identifies zero and negative amounts', () => {
      expect(Money.zero().isZero()).toBe(true);
      expect(Money.fromCents(-1).isNegative()).toBe(true);
      expect(Money.fromCents(1).isNegative()).toBe(false);
    });
  });

  describe('toNumber', () => {
    it('converts back to a decimal number of the major unit', () => {
      expect(Money.fromCents(1050).toNumber()).toBe(10.5);
      expect(Money.fromCents(5).toNumber()).toBe(0.05);
    });
  });

  describe('toDecimalString', () => {
    it('renders a positive amount with two fractional digits', () => {
      expect(Money.fromCents(1990).toDecimalString()).toBe('19.90');
    });

    it('pads a sub-ten cents remainder', () => {
      expect(Money.fromCents(5).toDecimalString()).toBe('0.05');
    });

    it('renders a negative amount with the sign in front', () => {
      expect(Money.fromCents(-345).toDecimalString()).toBe('-3.45');
    });

    it('renders zero', () => {
      expect(Money.zero().toDecimalString()).toBe('0.00');
    });
  });
});

describe('Money.scaled', () => {
  const money = (value: string): Money => Money.fromDecimalString(value);

  /**
   * The reason this operation exists. Chaining `dividedBy` then `times`
   * rounds the per-unit cost to a whole cent before it is ever multiplied,
   * and for anything measured in grams that rounding is most of the value.
   */
  it('keeps a fraction of a cent alive that a chained divide would destroy', () => {
    const packageCost = money('28.00');

    expect(packageCost.scaled(120, 1000).toDecimalString()).toBe('3.36');
    // What the chained form produces, for contrast.
    expect(packageCost.dividedBy(1000).times(120).toDecimalString()).toBe('3.60');
  });

  it('multiplies before dividing', () => {
    expect(money('10.00').scaled(1, 3).toDecimalString()).toBe('3.33');
    expect(money('10.00').scaled(3, 3).toDecimalString()).toBe('10.00');
  });

  it('rounds exactly once, half away from zero', () => {
    // 500 cents x 3 / 1000 = 1.5 cents -> 2 cents.
    expect(money('5.00').scaled(3, 1000).toDecimalString()).toBe('0.02');
    // 500 cents x 1 / 1000 = 0.5 cents -> 1 cent.
    expect(money('5.00').scaled(1, 1000).toDecimalString()).toBe('0.01');
  });

  it('rounds a negative amount away from zero too', () => {
    expect(money('-5.00').scaled(3, 1000).toDecimalString()).toBe('-0.02');
  });

  it('is zero when the amount is zero', () => {
    expect(Money.zero().scaled(120, 1000).isZero()).toBe(true);
  });

  it('accepts a fractional multiplier', () => {
    expect(money('59.90').scaled(0.146, 1).toDecimalString()).toBe('8.75');
  });

  it('refuses a non-finite multiplier', () => {
    expect(() => money('1.00').scaled(Number.NaN, 1)).toThrow(InvalidMoneyOperationError);
    expect(() => money('1.00').scaled(Number.POSITIVE_INFINITY, 1)).toThrow(
      InvalidMoneyOperationError,
    );
  });

  it('refuses a zero or non-finite divisor', () => {
    expect(() => money('1.00').scaled(1, 0)).toThrow(InvalidMoneyOperationError);
    expect(() => money('1.00').scaled(1, Number.NaN)).toThrow(InvalidMoneyOperationError);
  });

  it('leaves the original untouched', () => {
    const original = money('28.00');
    original.scaled(120, 1000);

    expect(original.toDecimalString()).toBe('28.00');
  });
});
