import { Money } from '../../../shared/domain/money/money';
import { estimatePurchase, totalPurchaseEstimate } from './purchase-estimate';

const flour = { packageQuantity: 1000, packageCost: Money.fromDecimalString('28.00') };

describe('estimatePurchase', () => {
  it('buys a whole package for a shortage smaller than one', () => {
    const estimate = estimatePurchase({ shortage: 40, ...flour });

    expect(estimate.packagesToBuy).toBe(1);
    // A fraction of the package (4% of 28.00) would understate the purchase.
    expect(estimate.estimatedCost?.toDecimalString()).toBe('28.00');
  });

  it('buys exactly one package when the shortage is exactly one package', () => {
    const estimate = estimatePurchase({ shortage: 1000, ...flour });

    expect(estimate.packagesToBuy).toBe(1);
    expect(estimate.estimatedCost?.toDecimalString()).toBe('28.00');
  });

  it('buys a second package for a single unit more than one', () => {
    const estimate = estimatePurchase({ shortage: 1001, ...flour });

    expect(estimate.packagesToBuy).toBe(2);
    expect(estimate.estimatedCost?.toDecimalString()).toBe('56.00');
  });

  it('is not pushed up a package by binary fuzz: 0.7 in packages of 0.1 is 7, not 8', () => {
    // 0.7 / 0.1 is 7.000000000000001 in floating point.
    const estimate = estimatePurchase({
      shortage: 0.7,
      packageQuantity: 0.1,
      packageCost: Money.fromDecimalString('2.00'),
    });

    expect(estimate.packagesToBuy).toBe(7);
    expect(estimate.estimatedCost?.toDecimalString()).toBe('14.00');
  });

  it('does not buy anything for a shortage that exists only as float residue', () => {
    // 0.3 - (0.1 + 0.2) is -5.55e-17; the opposite order leaves +5.55e-17.
    const estimate = estimatePurchase({ shortage: 0.1 + 0.2 - 0.3, ...flour });

    expect(estimate.packagesToBuy).toBe(0);
    expect(estimate.estimatedCost?.isZero()).toBe(true);
    expect(estimate.estimateIssue).toBeNull();
  });

  it('contributes zero when there is no shortage, a real zero and not a missing one', () => {
    const estimate = estimatePurchase({ shortage: 0, ...flour });

    expect(estimate.packagesToBuy).toBe(0);
    expect(estimate.estimatedCost?.isZero()).toBe(true);
    expect(estimate.estimateIssue).toBeNull();
  });

  it('contributes zero for no shortage even when the package data is unusable', () => {
    const estimate = estimatePurchase({ shortage: 0, packageQuantity: 0, packageCost: null });

    expect(estimate.packagesToBuy).toBe(0);
    expect(estimate.estimatedCost?.isZero()).toBe(true);
    expect(estimate.estimateIssue).toBeNull();
  });

  describe('package data that cannot support an estimate', () => {
    it.each([
      ['a zero package quantity', { packageQuantity: 0, packageCost: flour.packageCost }],
      ['a negative package quantity', { packageQuantity: -5, packageCost: flour.packageCost }],
      ['a missing package quantity', { packageQuantity: null, packageCost: flour.packageCost }],
      [
        'a non-finite package quantity',
        { packageQuantity: Number.NaN, packageCost: flour.packageCost },
      ],
    ])('%s is flagged, with neither a cost nor a division by zero', (_name, data) => {
      const estimate = estimatePurchase({ shortage: 40, ...data });

      expect(estimate.packagesToBuy).toBeNull();
      expect(estimate.estimatedCost).toBeNull();
      expect(estimate.estimateIssue).toBe('MISSING_PACKAGE_DATA');
    });

    it.each([
      ['a zero package cost', Money.zero()],
      ['a missing package cost', null],
    ])('%s still counts the packages, but not a cost', (_name, packageCost) => {
      const estimate = estimatePurchase({ shortage: 1500, packageQuantity: 1000, packageCost });

      expect(estimate.packagesToBuy).toBe(2);
      expect(estimate.estimatedCost).toBeNull();
      expect(estimate.estimateIssue).toBe('MISSING_PACKAGE_DATA');
    });
  });
});

describe('totalPurchaseEstimate', () => {
  it('adds the estimated lines and counts the ones it could not estimate', () => {
    const total = totalPurchaseEstimate([
      estimatePurchase({ shortage: 40, ...flour }),
      estimatePurchase({ shortage: 1500, ...flour }),
      estimatePurchase({ shortage: 0, ...flour }),
      estimatePurchase({ shortage: 10, packageQuantity: 100, packageCost: Money.zero() }),
    ]);

    expect(total.estimatedTotal.toDecimalString()).toBe('84.00');
    expect(total.unestimatedLineCount).toBe(1);
  });

  it('is zero, and complete, for no lines', () => {
    const total = totalPurchaseEstimate([]);

    expect(total.estimatedTotal.isZero()).toBe(true);
    expect(total.unestimatedLineCount).toBe(0);
  });
});
