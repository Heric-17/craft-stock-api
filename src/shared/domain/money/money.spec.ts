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
});
