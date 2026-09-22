import { Money } from '../../../shared/domain/money/money';
import { aggregateInvoiceItems, sumGrossValues } from './invoice-item-aggregation';
import { InvoiceStructureChangedError } from './invoice.error';
import type { RawInvoiceItem } from './raw-invoice';

function line(overrides: Partial<RawInvoiceItem> = {}): RawInvoiceItem {
  return {
    code: '92342',
    description: 'QUEIJO AZUL DOR',
    quantity: 0.11,
    unit: 'KG9',
    unitPrice: Money.fromDecimalString('59.90'),
    grossValue: Money.fromDecimalString('6.59'),
    ...overrides,
  };
}

describe('aggregateInvoiceItems', () => {
  /**
   * The case this exists for. An item weighed at the till is rung up once per
   * weighing — same code, one line per weight — and the note carries four
   * lines of the same cheese.
   */
  it('folds the repeated lines of a weighed item into one', () => {
    const aggregated = aggregateInvoiceItems([
      line({ quantity: 0.11, grossValue: Money.fromDecimalString('6.59') }),
      line({ quantity: 0.146, grossValue: Money.fromDecimalString('8.75') }),
      line({ quantity: 0.124, grossValue: Money.fromDecimalString('7.43') }),
      line({ quantity: 0.11, grossValue: Money.fromDecimalString('6.59') }),
    ]);

    expect(aggregated).toHaveLength(1);
    expect(aggregated[0].quantity).toBeCloseTo(0.49, 10);
    expect(aggregated[0].grossValue.toDecimalString()).toBe('29.36');
    expect(aggregated[0].lineCount).toBe(4);
  });

  it('keeps different products apart', () => {
    const aggregated = aggregateInvoiceItems([
      line({ code: '92342', description: 'QUEIJO AZUL DOR' }),
      line({ code: '71530', description: 'QJO.GOUDA SUPREMO' }),
      line({ code: '92342', description: 'QUEIJO AZUL DOR' }),
    ]);

    expect(aggregated.map((item) => item.code)).toEqual(['92342', '71530']);
    expect(aggregated[0].lineCount).toBe(2);
    expect(aggregated[1].lineCount).toBe(1);
  });

  it('leaves an ordinary single line exactly as it was', () => {
    const [aggregated] = aggregateInvoiceItems([
      line({ code: '4424', description: 'CHOC.NESTLE TRIO', quantity: 4, unit: 'UND9' }),
    ]);

    expect(aggregated.quantity).toBe(4);
    expect(aggregated.lineCount).toBe(1);
    expect(aggregated.unit).toBe('UND9');
  });

  it('preserves the total: folding lines together never changes what the note is worth', () => {
    const lines = [
      line({ quantity: 0.11, grossValue: Money.fromDecimalString('6.59') }),
      line({ quantity: 0.146, grossValue: Money.fromDecimalString('8.75') }),
      line({ code: '4424', quantity: 4, grossValue: Money.fromDecimalString('37.96') }),
    ];

    expect(sumGrossValues(aggregateInvoiceItems(lines)).toDecimalString()).toBe(
      sumGrossValues(lines).toDecimalString(),
    );
  });

  /**
   * Grouping is by code, so a line without one cannot be grouped. An empty
   * key would silently merge unrelated products into a single stock entry.
   */
  it('refuses a line with no product code instead of grouping on an empty key', () => {
    expect(() => aggregateInvoiceItems([line({ code: '   ' })])).toThrow(
      InvoiceStructureChangedError,
    );
  });

  it('returns nothing for no lines', () => {
    expect(aggregateInvoiceItems([])).toEqual([]);
  });
});
