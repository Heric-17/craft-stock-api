import { Money } from '../../../../shared/domain/money/money';
import type { RepositoryContext } from '../../../../shared/domain/persistence/unit-of-work';
import { InMemoryUnitOfWork } from '../../../../shared/infrastructure/persistence/in-memory-unit-of-work';
import { InMemoryCompositeProductRepository } from '../../../composite-products/infrastructure/persistence/in-memory-composite-product.repository';
import { InMemoryPendingInvoiceRepository } from '../../../invoices/infrastructure/persistence/in-memory-pending-invoice.repository';
import { InMemoryMaterialRepository } from '../../../materials/infrastructure/persistence/in-memory-material.repository';
import { InMemorySaleRepository } from '../../../sales/infrastructure/persistence/in-memory-sale.repository';
import { InMemoryUserRepository } from '../../../users/infrastructure/persistence/in-memory-user.repository';
import { InMemoryPurchaseAnalyticsAdapter } from '../../infrastructure/analytics/in-memory-purchase-analytics.adapter';
import { InMemoryPurchaseRepository } from '../../infrastructure/persistence/in-memory-purchase.repository';
import type { InvoiceLineInput } from '../dto/purchases.dto';
import { PurchaseAnalyticsService } from './purchase-analytics.service';
import { PurchasesService } from './purchases.service';

function buildSuite(): { analytics: PurchaseAnalyticsService; purchases: PurchasesService } {
  const purchaseRepository = new InMemoryPurchaseRepository();
  const context: RepositoryContext = {
    materials: new InMemoryMaterialRepository(),
    compositeProducts: new InMemoryCompositeProductRepository(),
    sales: new InMemorySaleRepository(),
    purchases: purchaseRepository,
    pendingInvoices: new InMemoryPendingInvoiceRepository(),
    users: new InMemoryUserRepository(),
  };

  return {
    analytics: new PurchaseAnalyticsService(
      new InMemoryPurchaseAnalyticsAdapter(purchaseRepository),
    ),
    purchases: new PurchasesService(new InMemoryUnitOfWork(context)),
  };
}

function line(overrides: Partial<InvoiceLineInput> = {}): InvoiceLineInput {
  return {
    description: 'Farinha de trigo 1kg',
    quantity: 1,
    unitPrice: '10.00',
    grossValue: '10.00',
    isCompanyExpense: true,
    materialId: null,
    ...overrides,
  };
}

function sum(values: readonly string[]): Money {
  return values.reduce((total, value) => total.plus(Money.fromDecimalString(value)), Money.zero());
}

const SEPTEMBER = { from: new Date('2026-09-01T00:00:00Z'), to: new Date('2026-10-01T00:00:00Z') };

describe('PurchaseAnalyticsService.getSpending', () => {
  it('sums what was paid, not full price, and reports the gap as the discount', async () => {
    const { analytics, purchases } = buildSuite();

    const view = await purchases.registerInvoicePurchase({
      purchaseDate: new Date('2026-09-10T12:00:00Z'),
      accessKey: null,
      rawInvoiceData: null,
      grossTotal: '100.00',
      discountTotal: '13.00',
      lines: [
        line({ grossValue: '60.00', unitPrice: '60.00' }),
        line({ grossValue: '40.00', unitPrice: '40.00' }),
      ],
    });

    const dataset = await analytics.getSpending({ ...SEPTEMBER, granularity: 'MONTH' });
    const grossSum = sum(view.items.map((item) => item.grossValue));

    expect(dataset).toEqual([{ period: '2026-09', netSpend: '87.00', discountTotal: '13.00' }]);
    // The panel deliberately disagrees with the sum of the gross line values,
    // by exactly the discount. Closing that gap would break the pricing side.
    expect(grossSum.toDecimalString()).toBe('100.00');
    expect(grossSum.minus(Money.fromDecimalString(dataset[0].netSpend)).toDecimalString()).toBe(
      '13.00',
    );
  });

  it('leaves spending equal to full price when no note granted a discount', async () => {
    const { analytics, purchases } = buildSuite();

    await purchases.registerInvoicePurchase({
      purchaseDate: new Date('2026-09-10T12:00:00Z'),
      accessKey: null,
      rawInvoiceData: null,
      grossTotal: '25.50',
      discountTotal: '0.00',
      lines: [line({ grossValue: '25.50', unitPrice: '25.50' })],
    });

    const dataset = await analytics.getSpending({ ...SEPTEMBER, granularity: 'MONTH' });

    expect(dataset).toEqual([{ period: '2026-09', netSpend: '25.50', discountTotal: '0.00' }]);
  });

  it('leaves out what is not a company expense', async () => {
    const { analytics, purchases } = buildSuite();

    await purchases.registerInvoicePurchase({
      purchaseDate: new Date('2026-09-10T12:00:00Z'),
      accessKey: null,
      rawInvoiceData: null,
      grossTotal: '30.00',
      discountTotal: '0.00',
      lines: [
        line({ grossValue: '20.00', unitPrice: '20.00' }),
        line({
          description: 'Item pessoal',
          grossValue: '10.00',
          unitPrice: '10.00',
          isCompanyExpense: false,
        }),
      ],
    });

    const dataset = await analytics.getSpending({ ...SEPTEMBER, granularity: 'MONTH' });

    expect(dataset[0].netSpend).toBe('20.00');
  });

  it('buckets by day when asked for the finer dimension', async () => {
    const { analytics, purchases } = buildSuite();

    for (const day of ['2026-09-10T08:00:00Z', '2026-09-10T20:00:00Z', '2026-09-12T09:00:00Z']) {
      await purchases.registerInvoicePurchase({
        purchaseDate: new Date(day),
        accessKey: null,
        rawInvoiceData: null,
        grossTotal: '10.00',
        discountTotal: '1.00',
        lines: [line()],
      });
    }

    const dataset = await analytics.getSpending({ ...SEPTEMBER, granularity: 'DAY' });

    expect(dataset).toEqual([
      { period: '2026-09-10', netSpend: '18.00', discountTotal: '2.00' },
      { period: '2026-09-12', netSpend: '9.00', discountTotal: '1.00' },
    ]);
  });

  it('ignores purchases outside the requested period', async () => {
    const { analytics, purchases } = buildSuite();

    await purchases.registerInvoicePurchase({
      purchaseDate: new Date('2026-08-31T23:59:59Z'),
      accessKey: null,
      rawInvoiceData: null,
      grossTotal: '10.00',
      discountTotal: '0.00',
      lines: [line()],
    });

    await expect(analytics.getSpending({ ...SEPTEMBER, granularity: 'MONTH' })).resolves.toEqual(
      [],
    );
  });
});
