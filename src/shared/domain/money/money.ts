import { InvalidMoneyOperationError } from './money.error';

const DECIMAL_STRING_PATTERN = /^(-?)(\d+)(?:\.(\d+))?$/;

/**
 * Money value object. Immutable, stores its amount internally as an integer
 * number of cents so that no arithmetic on it ever goes through floating
 * point — the fractional cost of a `Material` (`packageCost / packageQuantity`,
 * multiplied and summed across a whole `BillOfMaterials`) is exactly the kind
 * of repeated division where float error accumulates.
 *
 * Rounding is defined in exactly one place: {@link Money.round}, half away
 * from zero. Every operation that can produce a fractional cent (`times`,
 * `dividedBy`, parsing a decimal string) funnels through it.
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

    return new Money(Money.round(this.cents * factor));
  }

  dividedBy(divisor: number): Money {
    if (!Number.isFinite(divisor) || divisor === 0) {
      throw new InvalidMoneyOperationError(
        `Money.dividedBy requires a finite, non-zero divisor, received ${divisor}.`,
      );
    }

    return new Money(Money.round(this.cents / divisor));
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

    return new Money(Money.round((this.cents * multiplier) / divisor));
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
