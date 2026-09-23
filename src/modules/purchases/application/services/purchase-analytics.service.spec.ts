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
import { PurchaseEditingService } from './purchase-editing.service';
import { PurchasesService } from './purchases.service';

interface Suite {
  analytics: PurchaseAnalyticsService;
  purchases: PurchasesService;
  editing: PurchaseEditingService;
}

function buildSuite(): Suite {
  const purchaseRepository = new InMemoryPurchaseRepository();
  const context: RepositoryContext = {
    materials: new InMemoryMaterialRepository(),
    compositeProducts: new InMemoryCompositeProductRepository(),
    sales: new InMemorySaleRepository(),
    purchases: purchaseRepository,
    pendingInvoices: new InMemoryPendingInvoiceRepository(),
    users: new InMemoryUserRepository(),
  };
  const unitOfWork = new InMemoryUnitOfWork(context);

  return {
    analytics: new PurchaseAnalyticsService(
      new InMemoryPurchaseAnalyticsAdapter(purchaseRepository),
    ),
    purchases: new PurchasesService(unitOfWork, purchaseRepository),
    editing: new PurchaseEditingService(unitOfWork),
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
const QUARTER = { from: new Date('2026-07-01T00:00:00Z'), to: new Date('2026-10-01T00:00:00Z') };

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

    expect(dataset.byPeriod).toEqual([
      { period: '2026-09', netSpend: '87.00', discountTotal: '13.00', purchaseCount: 1 },
    ]);
    // The panel deliberately disagrees with the sum of the gross line values,
    // by exactly the discount. Closing that gap would break the pricing side.
    expect(grossSum.toDecimalString()).toBe('100.00');
    expect(
      grossSum.minus(Money.fromDecimalString(dataset.byPeriod[0].netSpend)).toDecimalString(),
    ).toBe('13.00');
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

    // A period with no discount reports zero savings. That is a result, not
    // a gap in the data, and the screen has to read it as one.
    expect(dataset.byPeriod).toEqual([
      { period: '2026-09', netSpend: '25.50', discountTotal: '0.00', purchaseCount: 1 },
    ]);
  });

  it('sums the net of company lines only, and ignores the discount of a personal one', async () => {
    const { analytics, purchases } = buildSuite();

    await purchases.registerInvoicePurchase({
      purchaseDate: new Date('2026-09-10T12:00:00Z'),
      accessKey: null,
      rawInvoiceData: null,
      grossTotal: '120.00',
      discountTotal: '20.00',
      // The note of the discount policy itself: flour for the business, wine
      // for the house, and the whole discount granted on the wine.
      discountAllocationMode: 'PERSONAL_ONLY',
      lines: [
        line({ description: 'Farinha', grossValue: '20.00', unitPrice: '20.00' }),
        line({
          description: 'Vinho',
          grossValue: '100.00',
          unitPrice: '100.00',
          isCompanyExpense: false,
        }),
      ],
    });

    const dataset = await analytics.getSpending({ ...SEPTEMBER, granularity: 'MONTH' });

    // The business spent the full 20.00 on flour: the discount went to the
    // wine, and none of it is the company's saving. Crediting the note's
    // whole 20.00 of discount to the business is exactly the error the
    // company-line rule exists to prevent.
    expect(dataset.byPeriod).toEqual([
      { period: '2026-09', netSpend: '20.00', discountTotal: '0.00', purchaseCount: 1 },
    ]);
  });

  it('moves the company spend between COMPANY_ONLY and PERSONAL_ONLY, leaving the note paid the same', async () => {
    const { analytics, purchases, editing } = buildSuite();

    const created = await purchases.registerInvoicePurchase({
      purchaseDate: new Date('2026-09-14T12:00:00Z'),
      accessKey: null,
      rawInvoiceData: null,
      grossTotal: '120.00',
      discountTotal: '20.00',
      discountAllocationMode: 'COMPANY_ONLY',
      lines: [
        line({ description: 'Farinha', grossValue: '20.00', unitPrice: '20.00' }),
        line({
          description: 'Vinho',
          grossValue: '100.00',
          unitPrice: '100.00',
          isCompanyExpense: false,
        }),
      ],
    });

    const underCompanyOnly = await analytics.getSpending({ ...SEPTEMBER, granularity: 'MONTH' });

    // The whole 20.00 landed on the flour line, so the business paid nothing
    // for it and saved 20.00.
    expect(underCompanyOnly.byPeriod).toEqual([
      { period: '2026-09', netSpend: '0.00', discountTotal: '20.00', purchaseCount: 1 },
    ]);

    const reallocated = await editing.setDiscountAllocation(created.id, {
      mode: 'PERSONAL_ONLY',
    });
    const underPersonalOnly = await analytics.getSpending({ ...SEPTEMBER, granularity: 'MONTH' });

    // Same note, same money out of the door: what changed is whose discount
    // it was. The business now paid the flour in full and saved nothing.
    expect(underPersonalOnly.byPeriod).toEqual([
      { period: '2026-09', netSpend: '20.00', discountTotal: '0.00', purchaseCount: 1 },
    ]);
    expect(reallocated.netTotal).toBe('100.00');
    expect(reallocated.grossTotal).toBe('120.00');
    expect(reallocated.discountTotal).toBe('20.00');
  });

  it('groups by establishment as well as by period, and ranks the shops by spend', async () => {
    const { analytics, purchases } = buildSuite();

    await purchases.registerInvoicePurchase({
      purchaseDate: new Date('2026-09-02T12:00:00Z'),
      accessKey: null,
      rawInvoiceData: null,
      establishment: { name: 'ATACADAO S.A.', cnpj: '75.315.333/0088-60' },
      grossTotal: '30.00',
      discountTotal: '0.00',
      lines: [line({ grossValue: '30.00', unitPrice: '30.00' })],
    });

    // Same shop, and the trading name as the till printed it that day. The
    // CNPJ is what holds the two together.
    await purchases.registerInvoicePurchase({
      purchaseDate: new Date('2026-09-20T12:00:00Z'),
      accessKey: null,
      rawInvoiceData: null,
      establishment: { name: 'ATACADAO ZONA SUL', cnpj: '75.315.333/0088-60' },
      grossTotal: '10.00',
      discountTotal: '0.00',
      lines: [line()],
    });

    await purchases.registerInvoicePurchase({
      purchaseDate: new Date('2026-09-21T12:00:00Z'),
      accessKey: null,
      rawInvoiceData: null,
      establishment: { name: 'MERCADO DA ESQUINA', cnpj: null },
      grossTotal: '5.00',
      discountTotal: '0.00',
      lines: [line({ grossValue: '5.00', unitPrice: '5.00' })],
    });

    const dataset = await analytics.getSpending({ ...SEPTEMBER, granularity: 'MONTH' });

    expect(dataset.byEstablishment).toEqual([
      {
        establishmentId: '75.315.333/0088-60',
        establishmentName: 'ATACADAO S.A.',
        netSpend: '40.00',
        discountTotal: '0.00',
        purchaseCount: 2,
      },
      {
        // No CNPJ to be known by, so the name the user typed is its identity.
        establishmentId: 'MERCADO DA ESQUINA',
        establishmentName: 'MERCADO DA ESQUINA',
        netSpend: '5.00',
        discountTotal: '0.00',
        purchaseCount: 1,
      },
    ]);
    // One period, three purchases: the average ticket the panel shows is a
    // division the client does over these two figures.
    expect(dataset.byPeriod).toEqual([
      { period: '2026-09', netSpend: '45.00', discountTotal: '0.00', purchaseCount: 3 },
    ]);
  });

  it('narrows every dimension to one establishment when asked', async () => {
    const { analytics, purchases } = buildSuite();

    await purchases.registerInvoicePurchase({
      purchaseDate: new Date('2026-09-02T12:00:00Z'),
      accessKey: null,
      rawInvoiceData: null,
      establishment: { name: 'ATACADAO S.A.', cnpj: '75.315.333/0088-60' },
      grossTotal: '30.00',
      discountTotal: '0.00',
      lines: [line({ grossValue: '30.00', unitPrice: '30.00' })],
    });

    await purchases.registerInvoicePurchase({
      purchaseDate: new Date('2026-09-03T12:00:00Z'),
      accessKey: null,
      rawInvoiceData: null,
      establishment: { name: 'MERCADO DA ESQUINA', cnpj: null },
      grossTotal: '5.00',
      discountTotal: '0.00',
      lines: [line({ grossValue: '5.00', unitPrice: '5.00' })],
    });

    const dataset = await analytics.getSpending({
      ...SEPTEMBER,
      granularity: 'MONTH',
      establishmentId: '75.315.333/0088-60',
    });

    expect(dataset.byPeriod).toEqual([
      { period: '2026-09', netSpend: '30.00', discountTotal: '0.00', purchaseCount: 1 },
    ]);
    expect(dataset.byEstablishment).toHaveLength(1);
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

    expect(dataset.byPeriod).toEqual([
      { period: '2026-09-10', netSpend: '18.00', discountTotal: '2.00', purchaseCount: 2 },
      { period: '2026-09-12', netSpend: '9.00', discountTotal: '1.00', purchaseCount: 1 },
    ]);
  });

  it('spreads several months across the period dimension in order', async () => {
    const { analytics, purchases } = buildSuite();

    for (const [day, amount] of [
      ['2026-07-05T10:00:00Z', '10.00'],
      ['2026-08-05T10:00:00Z', '20.00'],
      ['2026-09-05T10:00:00Z', '30.00'],
    ]) {
      await purchases.registerInvoicePurchase({
        purchaseDate: new Date(day),
        accessKey: null,
        rawInvoiceData: null,
        grossTotal: amount,
        discountTotal: '0.00',
        lines: [line({ grossValue: amount, unitPrice: amount })],
      });
    }

    const dataset = await analytics.getSpending({ ...QUARTER, granularity: 'MONTH' });

    // The month-on-month curve is a read straight down this array: no
    // endpoint computes it.
    expect(dataset.byPeriod.map((bucket) => [bucket.period, bucket.netSpend])).toEqual([
      ['2026-07', '10.00'],
      ['2026-08', '20.00'],
      ['2026-09', '30.00'],
    ]);
  });

  it('returns empty dimensions for a period with no purchases', async () => {
    const { analytics } = buildSuite();

    const dataset = await analytics.getSpending({ ...SEPTEMBER, granularity: 'MONTH' });

    expect(dataset.byPeriod).toEqual([]);
    expect(dataset.byEstablishment).toEqual([]);
    expect(dataset.granularity).toBe('MONTH');
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

    const dataset = await analytics.getSpending({ ...SEPTEMBER, granularity: 'MONTH' });

    expect(dataset.byPeriod).toEqual([]);
  });

  it('leaves out a purchase whose manual attribution is still pending', async () => {
    const { analytics, purchases, editing } = buildSuite();

    const created = await purchases.registerInvoicePurchase({
      purchaseDate: new Date('2026-09-10T12:00:00Z'),
      accessKey: null,
      rawInvoiceData: null,
      grossTotal: '100.00',
      discountTotal: '10.00',
      lines: [
        line({ grossValue: '60.00', unitPrice: '60.00' }),
        line({ grossValue: '40.00', unitPrice: '40.00' }),
      ],
    });

    await editing.setDiscountAllocation(created.id, {
      mode: 'MANUAL',
      manualAllocation: [
        { itemId: created.items[0].id, allocatedDiscount: '10.00' },
        { itemId: created.items[1].id, allocatedDiscount: '0.00' },
      ],
    });

    // Removing the line that was carrying the whole discount leaves nothing
    // to recompute: the user has to say where those 10.00 go now.
    const pending = await editing.removeItem(created.id, created.items[0].id);
    expect(pending.allocationPending).toBe(true);

    // Until they do, the month is not reported at all. Reporting it would
    // show a period that spent more than it did, with a discount only partly
    // attributed and nothing on screen saying so.
    await expect(analytics.getSpending({ ...SEPTEMBER, granularity: 'MONTH' })).resolves.toEqual(
      expect.objectContaining({ byPeriod: [], byEstablishment: [] }),
    );

    const restated = await editing.setDiscountAllocation(created.id, {
      mode: 'MANUAL',
      manualAllocation: [{ itemId: created.items[1].id, allocatedDiscount: '10.00' }],
    });
    expect(restated.allocationPending).toBe(false);

    const dataset = await analytics.getSpending({ ...SEPTEMBER, granularity: 'MONTH' });
    expect(dataset.byPeriod).toEqual([
      { period: '2026-09', netSpend: '30.00', discountTotal: '10.00', purchaseCount: 1 },
    ]);
  });
});
