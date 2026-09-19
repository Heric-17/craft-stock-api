import { Money } from '../../domain/money/money';
import { Prisma } from '../prisma/generated/client';

/**
 * The only place that converts between `Prisma.Decimal` and the domain
 * `Money` value object. Both directions go through decimal strings, never
 * through `Number`, so the conversion never reintroduces the floating point
 * error `Money` exists to avoid.
 */
export function toDomainMoney(value: Prisma.Decimal): Money {
  return Money.fromDecimalString(value.toString());
}

export function toPersistenceDecimal(money: Money): Prisma.Decimal {
  const cents = money.toCents();
  const sign = cents < 0 ? '-' : '';
  const absoluteCents = Math.abs(cents);
  const integerPart = Math.floor(absoluteCents / 100);
  const fractionPart = String(absoluteCents % 100).padStart(2, '0');

  return new Prisma.Decimal(`${sign}${integerPart}.${fractionPart}`);
}
