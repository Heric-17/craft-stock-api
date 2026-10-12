import { Money } from '../../../../shared/domain/money/money';
import type { PaymentStatus } from '../../domain/payment-status.enum';
import type { ProductionStatus } from '../../domain/production-status.enum';
import { SaleItem } from '../../domain/sale-item.entity';
import { Sale } from '../../domain/sale.entity';
import { InMemorySalesAnalyticsAdapter } from '../../infrastructure/analytics/in-memory-sales-analytics.adapter';
import { InMemorySaleRepository } from '../../infrastructure/persistence/in-memory-sale.repository';
import { SalesAnalyticsService } from './sales-analytics.service';

interface SaleOptions {
  id: string;
  createdAt: string;
  paymentStatus?: PaymentStatus;
  productionStatus?: ProductionStatus;
  /** `[priceBasisAmount, quantity, priceBasisQuantity]` per line. */
  lines: [string, number, number][];
}

async function addSale(repository: InMemorySaleRepository, options: SaleOptions): Promise<void> {
  const createdAt = new Date(options.createdAt);

  await repository.save(
    new Sale({
      id: options.id,
      customerName: 'Cliente',
      customerContact: null,
      paymentMethod: 'PIX',
      paymentStatus: options.paymentStatus ?? 'PENDING',
      productionStatus: options.productionStatus ?? 'PENDING',
      createdAt,
      updatedAt: createdAt,
    }),
  );
  await repository.saveItems(
    options.lines.map(
      ([amount, quantity, priceBasisQuantity], index) =>
        new SaleItem({
          id: `${options.id}-${index}`,
          saleId: options.id,
          compositeProductId: null,
          materialId: 'material-1',
          quantity,
          itemNameSnapshot: 'Item',
          priceBasisAmount: Money.fromDecimalString(amount),
          priceBasisQuantity,
        }),
    ),
  );
}

function buildSuite(): { repository: InMemorySaleRepository; service: SalesAnalyticsService } {
  const repository = new InMemorySaleRepository();

  return {
    repository,
    service: new SalesAnalyticsService(new InMemorySalesAnalyticsAdapter(repository)),
  };
}

const JANUARY = {
  from: new Date('2026-01-01T00:00:00-03:00'),
  to: new Date('2026-02-01T00:00:00-03:00'),
};

describe('SalesAnalyticsService.getSalesDataset', () => {
  it('reports an empty period as zeros in every cell, not as missing', async () => {
    const { service } = buildSuite();

    const dataset = await service.getSalesDataset(JANUARY);

    expect(dataset.byMonth).toEqual([{ month: '2026-01', saleCount: 0, totalAmount: '0.00' }]);
    expect(dataset.byPaymentStatus.every((cell) => cell.totalAmount === '0.00')).toBe(true);
    expect(dataset.byProductionStatus).toHaveLength(3);
    expect(dataset.openItems).toHaveLength(5);
  });

  it('totals a sale as the sum of its lines, each rounded to the cent', async () => {
    const { repository, service } = buildSuite();

    // Three lines of 1.00 over a basis of 3: 0.33 each, 0.99 together — never
    // the 1.00 that rounding the exact sum would give.
    await addSale(repository, {
      id: 'sale-1',
      createdAt: '2026-01-10T15:00:00Z',
      lines: [
        ['1.00', 1, 3],
        ['1.00', 1, 3],
        ['1.00', 1, 3],
      ],
    });

    const dataset = await service.getSalesDataset(JANUARY);

    expect(dataset.byMonth[0]).toEqual({ month: '2026-01', saleCount: 1, totalAmount: '0.99' });
  });

  it('leaves a month with no sales in the dataset, so a change against it can be computed', async () => {
    const { repository, service } = buildSuite();

    await addSale(repository, {
      id: 'sale-1',
      createdAt: '2026-01-10T15:00:00Z',
      lines: [['10.00', 1, 1]],
    });
    await addSale(repository, {
      id: 'sale-2',
      createdAt: '2026-03-10T15:00:00Z',
      lines: [['5.00', 1, 1]],
    });

    const dataset = await service.getSalesDataset({
      from: new Date('2026-01-01T00:00:00-03:00'),
      to: new Date('2026-04-01T00:00:00-03:00'),
    });

    expect(dataset.byMonth.map((cell) => [cell.month, cell.saleCount, cell.totalAmount])).toEqual([
      ['2026-01', 1, '10.00'],
      ['2026-02', 0, '0.00'],
      ['2026-03', 1, '5.00'],
    ]);
  });

  it('puts a sale made at 21:30 on 31 January in January, as the detail screen shows it', async () => {
    const { repository, service } = buildSuite();

    // 21:30 in Porto Alegre is 00:30 on 1 February in UTC.
    await addSale(repository, {
      id: 'late',
      createdAt: '2026-02-01T00:30:00Z',
      lines: [['40.00', 1, 1]],
    });

    const january = await service.getSalesDataset(JANUARY);
    const february = await service.getSalesDataset({
      from: new Date('2026-02-01T00:00:00-03:00'),
      to: new Date('2026-03-01T00:00:00-03:00'),
    });

    expect(january.byMonth[0]).toEqual({ month: '2026-01', saleCount: 1, totalAmount: '40.00' });
    expect(february.byMonth[0]).toEqual({ month: '2026-02', saleCount: 0, totalAmount: '0.00' });
  });

  it('excludes sales outside the period from the dimensions', async () => {
    const { repository, service } = buildSuite();

    await addSale(repository, {
      id: 'inside',
      createdAt: '2026-01-15T15:00:00Z',
      paymentStatus: 'PAID',
      productionStatus: 'DELIVERED',
      lines: [['10.00', 1, 1]],
    });
    await addSale(repository, {
      id: 'before',
      createdAt: '2025-12-31T20:00:00Z',
      paymentStatus: 'PAID',
      productionStatus: 'DELIVERED',
      lines: [['99.00', 1, 1]],
    });

    const dataset = await service.getSalesDataset(JANUARY);
    const paid = dataset.byPaymentStatus.find((cell) => cell.paymentStatus === 'PAID');

    expect(paid).toEqual({ paymentStatus: 'PAID', saleCount: 1, totalAmount: '10.00' });
  });

  it('keeps open sales regardless of the period: an old unpaid order is still owed', async () => {
    const { repository, service } = buildSuite();

    await addSale(repository, {
      id: 'old-unpaid',
      createdAt: '2024-03-10T15:00:00Z',
      paymentStatus: 'PENDING',
      productionStatus: 'DELIVERED',
      lines: [['99.90', 1, 1]],
    });
    await addSale(repository, {
      id: 'old-settled',
      createdAt: '2024-03-11T15:00:00Z',
      paymentStatus: 'PAID',
      productionStatus: 'DELIVERED',
      lines: [['500.00', 1, 1]],
    });
    await addSale(repository, {
      id: 'in-production',
      createdAt: '2026-01-05T15:00:00Z',
      paymentStatus: 'PAID',
      productionStatus: 'ASSEMBLED',
      lines: [['20.00', 1, 1]],
    });

    const dataset = await service.getSalesDataset(JANUARY);
    const cell = (payment: PaymentStatus, production: ProductionStatus) =>
      dataset.openItems.find(
        (open) => open.paymentStatus === payment && open.productionStatus === production,
      );

    expect(cell('PENDING', 'DELIVERED')).toEqual({
      paymentStatus: 'PENDING',
      productionStatus: 'DELIVERED',
      saleCount: 1,
      totalAmount: '99.90',
    });
    expect(cell('PAID', 'ASSEMBLED')?.totalAmount).toBe('20.00');
    // Paid and delivered is closed: it is not an open cell at all.
    expect(cell('PAID', 'DELIVERED')).toBeUndefined();
  });
});
