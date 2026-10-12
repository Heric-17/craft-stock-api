import { Money } from '../../../shared/domain/money/money';
import type { PaymentStatus } from './payment-status.enum';
import type { ProductionStatus } from './production-status.enum';
import { buildSalesDataset, isOpenSale, type SaleSummary } from './sales-dataset';

function sale(
  createdAt: string,
  total: string,
  paymentStatus: PaymentStatus = 'PENDING',
  productionStatus: ProductionStatus = 'PENDING',
): SaleSummary {
  return {
    createdAt: new Date(createdAt),
    paymentStatus,
    productionStatus,
    totalAmount: Money.fromDecimalString(total),
  };
}

const summary = (cell: { saleCount: number; totalAmount: Money } | undefined) => [
  cell?.saleCount,
  cell?.totalAmount.toDecimalString(),
];

const JANUARY = { from: new Date('2026-01-01T03:00:00Z'), to: new Date('2026-02-01T03:00:00Z') };

describe('buildSalesDataset', () => {
  it('lists every month of the range, with zeros where nothing was sold', () => {
    const dataset = buildSalesDataset(
      { from: new Date('2026-01-01T03:00:00Z'), to: new Date('2026-04-01T03:00:00Z') },
      [sale('2026-01-10T15:00:00Z', '10.00'), sale('2026-03-10T15:00:00Z', '5.00')],
      [],
    );

    expect(dataset.byMonth.map((m) => [m.month, ...summary(m)])).toEqual([
      ['2026-01', 1, '10.00'],
      ['2026-02', 0, '0.00'],
      ['2026-03', 1, '5.00'],
    ]);
  });

  it('keeps a 21:30 sale on 31 January in January', () => {
    const dataset = buildSalesDataset(JANUARY, [sale('2026-02-01T00:30:00Z', '40.00')], []);

    expect(dataset.byMonth).toHaveLength(1);
    expect(dataset.byMonth[0].month).toBe('2026-01');
    expect(dataset.byMonth[0].totalAmount.toDecimalString()).toBe('40.00');
  });

  it('reports every value of both status axes, zeros included', () => {
    const dataset = buildSalesDataset(JANUARY, [], []);

    expect(dataset.byPaymentStatus.map((c) => c.paymentStatus)).toEqual(['PENDING', 'PAID']);
    expect(dataset.byProductionStatus.map((c) => c.productionStatus)).toEqual([
      'PENDING',
      'ASSEMBLED',
      'DELIVERED',
    ]);
    expect(dataset.byMonth).toHaveLength(1);
    expect(dataset.byMonth[0].saleCount).toBe(0);
  });

  it('cuts the same sales along each axis independently', () => {
    const dataset = buildSalesDataset(
      JANUARY,
      [
        sale('2026-01-05T15:00:00Z', '10.00', 'PAID', 'DELIVERED'),
        sale('2026-01-06T15:00:00Z', '20.00', 'PENDING', 'ASSEMBLED'),
        sale('2026-01-07T15:00:00Z', '30.00', 'PAID', 'PENDING'),
      ],
      [],
    );

    expect(summary(dataset.byPaymentStatus.find((c) => c.paymentStatus === 'PAID'))).toEqual([
      2,
      '40.00',
    ]);
    expect(summary(dataset.byPaymentStatus.find((c) => c.paymentStatus === 'PENDING'))).toEqual([
      1,
      '20.00',
    ]);
    expect(
      summary(dataset.byProductionStatus.find((c) => c.productionStatus === 'ASSEMBLED')),
    ).toEqual([1, '20.00']);
  });

  it('adds up to the same total along every dimension', () => {
    const dataset = buildSalesDataset(
      JANUARY,
      [
        sale('2026-01-05T15:00:00Z', '10.01', 'PAID', 'DELIVERED'),
        sale('2026-01-06T15:00:00Z', '20.02', 'PENDING', 'ASSEMBLED'),
      ],
      [],
    );
    const total = (cells: { totalAmount: Money }[]) =>
      cells.reduce((sum, c) => sum.plus(c.totalAmount), Money.zero()).toDecimalString();

    expect(total(dataset.byMonth)).toBe('30.03');
    expect(total(dataset.byPaymentStatus)).toBe('30.03');
    expect(total(dataset.byProductionStatus)).toBe('30.03');
  });

  describe('openItems', () => {
    it('crosses the two axes over everything that is not both paid and delivered', () => {
      const dataset = buildSalesDataset(JANUARY, [], []);

      expect(dataset.openItems.map((c) => [c.paymentStatus, c.productionStatus])).toEqual([
        ['PENDING', 'PENDING'],
        ['PENDING', 'ASSEMBLED'],
        ['PENDING', 'DELIVERED'],
        ['PAID', 'PENDING'],
        ['PAID', 'ASSEMBLED'],
      ]);
      expect(dataset.openItems.every((c) => c.saleCount === 0 && c.totalAmount.isZero())).toBe(
        true,
      );
    });

    it('is not limited to the period: a sale of two years ago still unpaid is still owed', () => {
      const dataset = buildSalesDataset(
        JANUARY,
        [],
        [sale('2024-03-10T15:00:00Z', '99.90', 'PENDING', 'DELIVERED')],
      );
      const owed = dataset.openItems.find(
        (c) => c.paymentStatus === 'PENDING' && c.productionStatus === 'DELIVERED',
      );

      expect(summary(owed)).toEqual([1, '99.90']);
      expect(dataset.byMonth[0].saleCount).toBe(0);
    });
  });
});

describe('isOpenSale', () => {
  it.each([
    ['PENDING', 'PENDING', true],
    ['PENDING', 'DELIVERED', true],
    ['PAID', 'ASSEMBLED', true],
    ['PAID', 'DELIVERED', false],
  ] as const)('%s / %s -> %s', (payment, production, expected) => {
    expect(isOpenSale({ paymentStatus: payment, productionStatus: production })).toBe(expected);
  });
});
