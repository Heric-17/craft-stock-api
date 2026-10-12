import { Prisma } from '../prisma/generated/client';

/**
 * A margin is stored as a percentage in a `Decimal(5,2)` column and lives in
 * the domain as whole basis points. Two decimals of a percentage are exactly
 * one basis point, so the column loses nothing and needs no migration: 33,33
 * is 3333 and back. Both directions are `Decimal` arithmetic, which is exact
 * for this, and never go through `Number` until the value is already an
 * integer.
 */
export function toDomainBasisPoints(percentage: Prisma.Decimal): number {
  const basisPoints = percentage.mul(100);

  if (!basisPoints.isInteger()) {
    throw new RangeError(
      `Stored percentage ${percentage.toString()} is not a whole number of basis points.`,
    );
  }

  return basisPoints.toNumber();
}

export function toPersistencePercentage(basisPoints: number): Prisma.Decimal {
  return new Prisma.Decimal(basisPoints).div(100);
}
