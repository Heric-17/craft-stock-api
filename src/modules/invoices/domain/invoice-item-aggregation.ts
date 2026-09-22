import { Money } from '../../../shared/domain/money/money';
import { InvoiceStructureChangedError } from './invoice.error';
import type { RawInvoiceItem } from './raw-invoice';

/**
 * One line as the user is asked to classify it, and as it becomes a
 * `PurchaseItem`.
 */
export interface AggregatedInvoiceItem {
  code: string;
  description: string;
  quantity: number;
  unit: string;
  unitPrice: Money;
  grossValue: Money;
  /** How many printed lines were folded into this one. `1` for an ordinary item. */
  lineCount: number;
}

/**
 * Folds the note's lines together by product code.
 *
 * An item weighed at the till is rung up once per weighing: same code, one
 * line per weight. A note with four weighings of the same cheese would
 * otherwise ask the user to classify that cheese four times and would create
 * four separate stock entries for it. Quantity and gross value are summed;
 * the unit price is the one the lines already agree on.
 *
 * This is the presentation and `PurchaseItem` view of the note. The printed
 * lines survive untouched in `rawInvoiceData`, which is a captured fact and
 * is never rewritten.
 */
export function aggregateInvoiceItems(items: readonly RawInvoiceItem[]): AggregatedInvoiceItem[] {
  const byCode = new Map<string, AggregatedInvoiceItem>();

  for (const item of items) {
    // Grouping is by code, so a line without one cannot be grouped. Falling
    // back to an empty key would merge unrelated products into a single
    // stock entry, which is worse than refusing the note.
    if (item.code.trim().length === 0) {
      throw new InvoiceStructureChangedError(
        `Invoice line "${item.description}" has no product code, so its lines cannot be aggregated.`,
      );
    }

    const existing = byCode.get(item.code);

    if (!existing) {
      byCode.set(item.code, {
        code: item.code,
        description: item.description,
        quantity: item.quantity,
        unit: item.unit,
        unitPrice: item.unitPrice,
        grossValue: item.grossValue,
        lineCount: 1,
      });
      continue;
    }

    byCode.set(item.code, {
      ...existing,
      quantity: existing.quantity + item.quantity,
      grossValue: existing.grossValue.plus(item.grossValue),
      lineCount: existing.lineCount + 1,
    });
  }

  return [...byCode.values()];
}

/** Sum of the gross values, which must close with the note's own header total. */
export function sumGrossValues(items: readonly { grossValue: Money }[]): Money {
  return items.reduce((total, item) => total.plus(item.grossValue), Money.zero());
}
