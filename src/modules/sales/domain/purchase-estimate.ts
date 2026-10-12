import { Money } from '../../../shared/domain/money/money';

/** Why a shortage could not be turned into a cost. */
export type PurchaseEstimateIssue = 'MISSING_PACKAGE_DATA';

export interface PurchaseEstimateInput {
  /** What is missing, in the Material's consumption unit. Zero or less means nothing to buy. */
  shortage: number;
  /** What one purchased package holds, in the same unit. */
  packageQuantity: number | null | undefined;
  /** What one purchased package costs. */
  packageCost: Money | null | undefined;
}

export interface PurchaseEstimate {
  /**
   * Whole packages to buy: the shortage divided by what a package holds,
   * rounded UP. Null when that cannot be computed.
   */
  packagesToBuy: number | null;
  /** `packagesToBuy × packageCost`. Null when it cannot be computed — never zero standing in for unknown. */
  estimatedCost: Money | null;
  /** Set exactly when `estimatedCost` is null although something is missing. */
  estimateIssue: PurchaseEstimateIssue | null;
}

/** Ratios are compared at nine places so binary fuzz cannot add a package. */
const RATIO_DECIMAL_PLACES = 9;

/**
 * What it takes to cover a shortage, buying whole packages.
 *
 * A material is bought in a closed package, so a shortage of 40 g of a 1 kg
 * bag is one bag, not 4% of one: estimating by fraction would understate the
 * purchase every time. The packages are `ceil(shortage ÷ packageQuantity)`.
 *
 * The ratio is rounded to nine places before the `ceil`. Quantities are
 * doubles, and `0.7 ÷ 0.1` is `7.000000000000001`: a bare `ceil` would send the
 * user to buy eight packages for a shortage that is exactly seven. The same
 * rounding discards the `5.5e-17` left by `0.3 - (0.1 + 0.2)`, so a shortage
 * that only exists in binary does not become a purchase.
 *
 * Nothing to buy is zero packages and zero cost, whatever the package data
 * says. Something to buy with no usable package data cannot be estimated, and
 * is reported as such rather than as a cost of zero: a quantity of package that
 * is zero or negative would be a division by zero, and a package cost that is
 * zero means the cost was never informed, not that the material is free.
 */
export function estimatePurchase(input: PurchaseEstimateInput): PurchaseEstimate {
  if (!Number.isFinite(input.shortage) || input.shortage <= 0) {
    return { packagesToBuy: 0, estimatedCost: Money.zero(), estimateIssue: null };
  }

  const packageQuantity = input.packageQuantity;

  if (
    packageQuantity === null ||
    packageQuantity === undefined ||
    !Number.isFinite(packageQuantity) ||
    packageQuantity <= 0
  ) {
    return missing();
  }

  const ratio = Number((input.shortage / packageQuantity).toFixed(RATIO_DECIMAL_PLACES));
  const packagesToBuy = Math.ceil(ratio);

  if (packagesToBuy === 0) {
    return { packagesToBuy: 0, estimatedCost: Money.zero(), estimateIssue: null };
  }

  const packageCost = input.packageCost;

  if (
    packageCost === null ||
    packageCost === undefined ||
    !packageCost.isGreaterThan(Money.zero())
  ) {
    return { packagesToBuy, estimatedCost: null, estimateIssue: 'MISSING_PACKAGE_DATA' };
  }

  return { packagesToBuy, estimatedCost: packageCost.times(packagesToBuy), estimateIssue: null };
}

function missing(): PurchaseEstimate {
  return { packagesToBuy: null, estimatedCost: null, estimateIssue: 'MISSING_PACKAGE_DATA' };
}

export interface PurchaseEstimateTotal {
  /** The sum of the lines that could be estimated. A lower bound while `unestimatedLineCount` is above zero. */
  estimatedTotal: Money;
  /** Lines with something to buy whose cost could not be estimated. */
  unestimatedLineCount: number;
}

/**
 * Adds the lines up without hiding the ones that could not be estimated: the
 * total is only complete when `unestimatedLineCount` is zero.
 */
export function totalPurchaseEstimate(
  estimates: readonly PurchaseEstimate[],
): PurchaseEstimateTotal {
  return {
    estimatedTotal: estimates.reduce(
      (total, estimate) => total.plus(estimate.estimatedCost ?? Money.zero()),
      Money.zero(),
    ),
    unestimatedLineCount: estimates.filter((estimate) => estimate.estimateIssue !== null).length,
  };
}
