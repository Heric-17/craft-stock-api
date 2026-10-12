import { formatFractionalAmount } from './fractional-amount';
import { Money } from './money';
import { InvalidMoneyOperationError } from './money.error';

describe('formatFractionalAmount', () => {
  it('shows a sub-cent amount that whole cents cannot hold', () => {
    // R$ 28,00 per 1000 g: R$ 0,028 per gram, which as a Money would be R$ 0,03.
    expect(formatFractionalAmount(Money.fromDecimalString('28.00'), 1000)).toBe('0.0280');
  });

  it('keeps four places for an amount larger than a cent', () => {
    expect(formatFractionalAmount(Money.fromDecimalString('19.90'), 1)).toBe('19.9000');
  });

  it('rounds the fourth place rather than truncating it', () => {
    // R$ 10,00 over 3: R$ 3,333333... per unit.
    expect(formatFractionalAmount(Money.fromDecimalString('10.00'), 3)).toBe('3.3333');
    // R$ 20,00 over 3: R$ 6,666666... per unit.
    expect(formatFractionalAmount(Money.fromDecimalString('20.00'), 3)).toBe('6.6667');
  });

  it('decides a tie in the fourth place by the money rounding policy, half away from zero', () => {
    // 1 ¢ over 8 is 0,00125 R$ = 12,5 hundredths of a cent: a tie. Float
    // division rounded it with Math.round, which sends -12,5 to -12 (toward
    // +infinity) while 12,5 goes to 13; the policy sends both away from zero.
    expect(formatFractionalAmount(Money.fromCents(1), 8)).toBe('0.0013');
    expect(formatFractionalAmount(Money.fromCents(-1), 8)).toBe('-0.0013');
  });

  it('does not let float division decide a tie', () => {
    // 5 ¢ over 40 is exactly 12,5 hundredths of a cent as well, and 0,0013 is
    // the answer for every route to the same fraction.
    expect(formatFractionalAmount(Money.fromCents(5), 40)).toBe('0.0013');
    expect(formatFractionalAmount(Money.fromCents(-5), 40)).toBe('-0.0013');
  });

  it('keeps the sign in front of the whole amount', () => {
    expect(formatFractionalAmount(Money.fromDecimalString('-28.00'), 1000)).toBe('-0.0280');
  });

  it('formats zero', () => {
    expect(formatFractionalAmount(Money.zero(), 1000)).toBe('0.0000');
  });

  it('rejects a zero divisor', () => {
    expect(() => formatFractionalAmount(Money.fromDecimalString('28.00'), 0)).toThrow(
      InvalidMoneyOperationError,
    );
  });

  it('rejects a divisor that is not a finite number', () => {
    expect(() =>
      formatFractionalAmount(Money.fromDecimalString('28.00'), Number.POSITIVE_INFINITY),
    ).toThrow(InvalidMoneyOperationError);
  });
});
