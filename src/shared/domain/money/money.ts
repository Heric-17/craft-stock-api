import { InvalidMoneyOperationError } from './money.error';

const DECIMAL_STRING_PATTERN = /^(-?)(\d+)(?:\.(\d+))?$/;

/**
 * Decimal places a quantity keeps when it enters a calculation. Above what any
 * column carries (`Decimal(12,3)`, and the product of two of them), so no real
 * quantity loses a digit; what it discards is the binary fuzz a `number`
 * brings along (`0.30000000000000004`), which must not reach the tie decision.
 */
const QUANTITY_DECIMAL_PLACES = 6;

/**
 * Money value object. Immutable, stores its amount internally as an integer
 * number of cents so that no arithmetic on it ever goes through floating
 * point — the fractional cost of a `Material` (`packageCost / packageQuantity`,
 * multiplied and summed across a whole `BillOfMaterials`) is exactly the kind
 * of repeated division where float error accumulates.
 *
 * Rounding policy: **half away from zero**, applied to the exact result.
 * R$ 0,125 becomes R$ 0,13 and -R$ 0,125 becomes -R$ 0,13; 0,135 becomes 0,14.
 * A tie is decided by the rule and never by the representation of a number,
 * which is why `times`, `dividedBy` and `scaled` do their arithmetic on
 * integers (see {@link Money.scaled}) instead of multiplying floats. The
 * cases that pin the policy are in `money.spec.ts`.
 *
 * Two functions implement it: {@link Money.round}, for the digit-based parse of
 * a decimal string, and `divideRoundingHalfAwayFromZero`, for everything that
 * scales an amount.
 */
export class Money {
  private constructor(private readonly cents: number) {}

  static zero(): Money {
    return new Money(0);
  }

  static fromCents(cents: number): Money {
    if (!Number.isInteger(cents)) {
      throw new InvalidMoneyOperationError(
        `Money.fromCents requires an integer number of cents, received ${cents}.`,
      );
    }

    return new Money(cents);
  }

  /**
   * Parses a decimal amount given as a string (e.g. `"19.9"`, `"-3.456"`).
   * Parsing never goes through `parseFloat` on the full string — that would
   * reintroduce the float error this class exists to avoid. Instead the
   * string is split into its integer and fractional digits and only the
   * single digit past the cent is ever converted to `Number`, which keeps
   * the rounding decision exact regardless of how many fractional digits
   * the input carries.
   */
  static fromDecimalString(value: string): Money {
    const match = DECIMAL_STRING_PATTERN.exec(value.trim());

    if (!match) {
      throw new InvalidMoneyOperationError(`"${value}" is not a valid decimal amount.`);
    }

    const [, sign, integerPart, fractionPart = ''] = match;
    const fractionDigits = fractionPart.padEnd(3, '0');
    const centsWithRoundingDigit = Number(
      `${integerPart}${fractionDigits.slice(0, 2)}.${fractionDigits[2]}`,
    );
    const magnitude = Money.round(centsWithRoundingDigit);

    return new Money(sign === '-' ? -magnitude : magnitude);
  }

  /** Round half away from zero — the single rounding policy for this class. */
  private static round(value: number): number {
    return value >= 0 ? Math.floor(value + 0.5) : Math.ceil(value - 0.5);
  }

  plus(other: Money): Money {
    return new Money(this.cents + other.cents);
  }

  minus(other: Money): Money {
    return new Money(this.cents - other.cents);
  }

  times(factor: number): Money {
    if (!Number.isFinite(factor)) {
      throw new InvalidMoneyOperationError(
        `Money.times requires a finite factor, received ${factor}.`,
      );
    }

    return this.scaleExactly(factor, 1);
  }

  dividedBy(divisor: number): Money {
    if (!Number.isFinite(divisor) || divisor === 0) {
      throw new InvalidMoneyOperationError(
        `Money.dividedBy requires a finite, non-zero divisor, received ${divisor}.`,
      );
    }

    return this.scaleExactly(1, divisor);
  }

  /**
   * `this × multiplier ÷ divisor`, rounded exactly once, at the end.
   *
   * Chaining `times` and `dividedBy` would round twice, and the intermediate
   * rounding is the expensive one: a 1 kg bag of flour at R$ 28,00 costs
   * R$ 0,028 per gram, which `dividedBy` alone has to flatten to R$ 0,03,
   * because a `Money` holds whole cents. Multiplying that by the 120 g a
   * recipe uses gives R$ 3,60 instead of R$ 3,36 — a 7% error on every line
   * of every recipe with a fractional ingredient, compounding down the bill
   * of materials and into the suggested price.
   *
   * Doing both in one step keeps the fraction of a cent alive until there is
   * a real amount to round, which is the whole reason this class exists.
   *
   * The step is exact. Multiplier and divisor are taken as decimals with up
   * to six places and the whole expression is evaluated in integers, so a
   * result that is exactly half a cent is a tie that the rounding policy
   * decides. In floating point, `25 ¢ × 1.14` is `28.499999999999996` and
   * would round down to 28 ¢ when the exact value, 28.5 ¢, rounds to 29 ¢.
   */
  scaled(multiplier: number, divisor: number): Money {
    if (!Number.isFinite(multiplier)) {
      throw new InvalidMoneyOperationError(
        `Money.scaled requires a finite multiplier, received ${multiplier}.`,
      );
    }

    if (!Number.isFinite(divisor) || divisor === 0) {
      throw new InvalidMoneyOperationError(
        `Money.scaled requires a finite, non-zero divisor, received ${divisor}.`,
      );
    }

    return this.scaleExactly(multiplier, divisor);
  }

  private scaleExactly(multiplier: number, divisor: number): Money {
    const scaledDivisor = toScaledInteger(divisor);

    if (scaledDivisor === 0n) {
      throw new InvalidMoneyOperationError(
        `A divisor of ${divisor} is zero at ${QUANTITY_DECIMAL_PLACES} decimal places.`,
      );
    }

    const numerator = BigInt(this.cents) * toScaledInteger(multiplier);

    return new Money(Number(divideRoundingHalfAwayFromZero(numerator, scaledDivisor)));
  }

  equals(other: Money): boolean {
    return this.cents === other.cents;
  }

  isGreaterThan(other: Money): boolean {
    return this.cents > other.cents;
  }

  isGreaterThanOrEqual(other: Money): boolean {
    return this.cents >= other.cents;
  }

  isLessThan(other: Money): boolean {
    return this.cents < other.cents;
  }

  isLessThanOrEqual(other: Money): boolean {
    return this.cents <= other.cents;
  }

  isZero(): boolean {
    return this.cents === 0;
  }

  isNegative(): boolean {
    return this.cents < 0;
  }

  toCents(): number {
    return this.cents;
  }

  toNumber(): number {
    return this.cents / 100;
  }

  toDecimalString(): string {
    const sign = this.cents < 0 ? '-' : '';
    const abs = Math.abs(this.cents);
    const units = Math.trunc(abs / 100);
    const remainderCents = abs % 100;

    return `${sign}${units}.${String(remainderCents).padStart(2, '0')}`;
  }
}

/**
 * A quantity as an integer count of millionths. `toFixed` expands the exact
 * binary value of the double and rounds it in decimal, so `0.58` becomes
 * `580000` and `0.30000000000000004` becomes `300000`.
 */
function toScaledInteger(value: number): bigint {
  return BigInt(value.toFixed(QUANTITY_DECIMAL_PLACES).replace('.', ''));
}

/**
 * `numerator ÷ denominator` rounded half away from zero, in integers:
 * `floor((2·|n| + |d|) ÷ 2·|d|)`, with the sign put back at the end.
 */
function divideRoundingHalfAwayFromZero(numerator: bigint, denominator: bigint): bigint {
  const negative = numerator < 0n !== denominator < 0n;
  const absoluteNumerator = numerator < 0n ? -numerator : numerator;
  const absoluteDenominator = denominator < 0n ? -denominator : denominator;
  const quotient = (2n * absoluteNumerator + absoluteDenominator) / (2n * absoluteDenominator);

  return negative ? -quotient : quotient;
}
