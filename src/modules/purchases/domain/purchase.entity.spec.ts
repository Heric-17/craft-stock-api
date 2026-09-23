import { Money } from '../../../shared/domain/money/money';
import type { DiscountAllocationMode } from './discount-allocation-mode';
import { Purchase, type PurchaseProps } from './purchase.entity';
import { PurchaseItem, type PurchaseItemProps } from './purchase-item.entity';
import {
  DiscountAllocationDesyncError,
  DiscountAllocationError,
  InvalidPurchaseError,
  PendingDiscountAllocationError,
} from './purchase.error';

const money = (value: string): Money => Money.fromDecimalString(value);

const PURCHASE_ID = 'purchase-1';

function item(overrides: Partial<PurchaseItemProps> & { id: string }): PurchaseItem {
  return new PurchaseItem({
    purchaseId: PURCHASE_ID,
    code: 'code-1',
    description: 'Farinha de trigo 1kg',
    quantity: 1,
    unit: 'UND9',
    unitPrice: money('10.00'),
    grossValue: money('10.00'),
    allocatedDiscount: Money.zero(),
    isCompanyExpense: true,
    isStockMaterial: false,
    materialId: null,
    ...overrides,
  });
}

function purchase(overrides: Partial<PurchaseProps> = {}): Purchase {
  const items = overrides.items ?? [item({ id: 'a' })];
  const grossTotal =
    overrides.grossTotal ??
    items.reduce((total, line) => total.plus(line.grossValue), Money.zero());
  const discountTotal = overrides.discountTotal ?? Money.zero();

  return new Purchase({
    id: PURCHASE_ID,
    purchaseDate: new Date('2026-06-11T21:46:31Z'),
    accessKey: null,
    rawInvoiceData: null,
    establishment: null,
    grossTotal,
    discountTotal,
    netTotal: grossTotal.minus(discountTotal),
    discountAllocationMode: 'PROPORTIONAL',
    allocationPending: false,
    createdAt: new Date('2026-06-11T21:46:31Z'),
    ...overrides,
    items,
  });
}

/** Company flour at 20 and personal wine at 100, which is the worked example. */
function mixedPurchase(mode: DiscountAllocationMode, discount = '20.00'): Purchase {
  const items = [
    item({
      id: 'flour',
      description: 'Farinha',
      grossValue: money('20.00'),
      quantity: 1,
      unitPrice: money('20.00'),
      isCompanyExpense: true,
    }),
    item({
      id: 'wine',
      description: 'Vinho',
      grossValue: money('100.00'),
      quantity: 1,
      unitPrice: money('100.00'),
      isCompanyExpense: false,
    }),
  ];

  return purchase({
    items,
    discountTotal: money(discount),
    allocationPending: true,
  }).changeDiscountAllocation(
    mode,
    mode === 'MANUAL'
      ? new Map([
          ['flour', Money.zero()],
          ['wine', money(discount)],
        ])
      : undefined,
  );
}

const allocationOf = (p: Purchase, id: string): string =>
  (p.findItem(id) as PurchaseItem).allocatedDiscount.toDecimalString();

describe('Purchase construction', () => {
  it('rejects an access key that is not 44 digits', () => {
    expect(() => purchase({ accessKey: '123' })).toThrow(InvalidPurchaseError);
  });

  it('accepts a 44-digit access key', () => {
    expect(purchase({ accessKey: '4'.repeat(44) }).accessKey).toHaveLength(44);
  });

  it('rejects a header that does not close over its own lines', () => {
    expect(() => purchase({ grossTotal: money('99.00'), netTotal: money('99.00') })).toThrow(
      /does not match the reported grossTotal/,
    );
  });

  it('rejects a netTotal that is not grossTotal minus discountTotal', () => {
    expect(() => purchase({ discountTotal: money('1.00'), netTotal: money('10.00') })).toThrow(
      InvalidPurchaseError,
    );
  });

  it('rejects attributed discount that does not close with discountTotal', () => {
    expect(() =>
      purchase({
        items: [item({ id: 'a', allocatedDiscount: money('1.00') })],
        discountTotal: money('2.00'),
      }),
    ).toThrow(DiscountAllocationError);
  });

  /**
   * The failure mode the aggregate exists to make unreachable: a line sitting
   * outside the eligible set while still holding discount. The totals would
   * still close and nothing on the sum would notice; the only symptom would
   * be a wrong figure on the spending panel.
   */
  it('refuses a line that holds discount while outside the eligible set', () => {
    expect(() =>
      purchase({
        items: [
          item({ id: 'personal', isCompanyExpense: false, allocatedDiscount: money('2.00') }),
          item({ id: 'company', isCompanyExpense: true }),
        ],
        discountTotal: money('2.00'),
        discountAllocationMode: 'COMPANY_ONLY',
      }),
    ).toThrow(DiscountAllocationDesyncError);
  });
});

describe('Purchase.changeDiscountAllocation', () => {
  it('attributes proportionally over every line', () => {
    const allocated = mixedPurchase('PROPORTIONAL', '12.00');

    expect(allocationOf(allocated, 'flour')).toBe('2.00');
    expect(allocationOf(allocated, 'wine')).toBe('10.00');
  });

  it('attributes only to company lines under COMPANY_ONLY', () => {
    const allocated = mixedPurchase('COMPANY_ONLY', '12.00');

    expect(allocationOf(allocated, 'flour')).toBe('12.00');
    expect(allocationOf(allocated, 'wine')).toBe('0.00');
  });

  it('attributes only to personal lines under PERSONAL_ONLY', () => {
    const allocated = mixedPurchase('PERSONAL_ONLY');

    expect(allocationOf(allocated, 'flour')).toBe('0.00');
    expect(allocationOf(allocated, 'wine')).toBe('20.00');
  });

  it('takes the typed amounts under MANUAL', () => {
    const allocated = mixedPurchase('MANUAL');

    expect(allocationOf(allocated, 'flour')).toBe('0.00');
    expect(allocationOf(allocated, 'wine')).toBe('20.00');
  });

  it('leaves the purchase no longer pending once the sum closes', () => {
    expect(mixedPurchase('PROPORTIONAL').allocationPending).toBe(false);
  });

  it('is refused when the chosen mode has no eligible line', () => {
    const companyOnly = purchase({
      items: [item({ id: 'a', isCompanyExpense: true })],
      discountTotal: money('1.00'),
      allocationPending: true,
    });

    expect(() => companyOnly.changeDiscountAllocation('PERSONAL_ONLY')).toThrow(
      DiscountAllocationError,
    );
  });
});

describe('Purchase.classifyItem', () => {
  /**
   * Reclassifying the last eligible line away leaves COMPANY_ONLY with
   * nowhere to put the discount. That is refused out loud, rather than
   * silently leaving flour holding 12 while no longer being a company line.
   */
  it('refuses a reclassification that empties the eligible set', () => {
    const before = mixedPurchase('COMPANY_ONLY', '12.00');
    expect(allocationOf(before, 'flour')).toBe('12.00');

    expect(() =>
      before.classifyItem('flour', {
        isCompanyExpense: false,
        isStockMaterial: false,
        materialId: null,
      }),
    ).toThrow(DiscountAllocationError);
  });

  it('migrates the discount to the lines that stayed eligible, and the sum still closes', () => {
    const three = purchase({
      items: [
        item({
          id: 'a',
          grossValue: money('20.00'),
          unitPrice: money('20.00'),
          isCompanyExpense: true,
        }),
        item({
          id: 'b',
          grossValue: money('30.00'),
          unitPrice: money('30.00'),
          isCompanyExpense: true,
        }),
        item({
          id: 'c',
          grossValue: money('50.00'),
          unitPrice: money('50.00'),
          isCompanyExpense: false,
        }),
      ],
      discountTotal: money('10.00'),
      allocationPending: true,
    }).changeDiscountAllocation('COMPANY_ONLY');

    expect(allocationOf(three, 'a')).toBe('4.00');
    expect(allocationOf(three, 'b')).toBe('6.00');
    expect(allocationOf(three, 'c')).toBe('0.00');

    const reclassified = three.classifyItem('a', {
      isCompanyExpense: false,
      isStockMaterial: false,
      materialId: null,
    });

    // The whole discount migrated to the one line still eligible.
    expect(allocationOf(reclassified, 'a')).toBe('0.00');
    expect(allocationOf(reclassified, 'b')).toBe('10.00');
    expect(sumOf(reclassified)).toBe('10.00');
  });

  it('migrates the discount under PERSONAL_ONLY too', () => {
    const three = purchase({
      items: [
        item({
          id: 'a',
          grossValue: money('20.00'),
          unitPrice: money('20.00'),
          isCompanyExpense: false,
        }),
        item({
          id: 'b',
          grossValue: money('30.00'),
          unitPrice: money('30.00'),
          isCompanyExpense: false,
        }),
        item({
          id: 'c',
          grossValue: money('50.00'),
          unitPrice: money('50.00'),
          isCompanyExpense: true,
        }),
      ],
      discountTotal: money('10.00'),
      allocationPending: true,
    }).changeDiscountAllocation('PERSONAL_ONLY');

    expect(allocationOf(three, 'a')).toBe('4.00');

    const reclassified = three.classifyItem('a', {
      isCompanyExpense: true,
      isStockMaterial: false,
      materialId: null,
    });

    expect(allocationOf(reclassified, 'a')).toBe('0.00');
    expect(allocationOf(reclassified, 'b')).toBe('10.00');
    expect(sumOf(reclassified)).toBe('10.00');
  });

  /**
   * MANUAL does not depend on the eligible set, so what the user typed
   * survives a reclassification — but it still goes through the root, so
   * there is one way in rather than two.
   */
  it('preserves a MANUAL attribution across a reclassification', () => {
    const manual = mixedPurchase('MANUAL');

    const reclassified = manual.classifyItem('wine', {
      isCompanyExpense: true,
      isStockMaterial: false,
      materialId: null,
    });

    expect(allocationOf(reclassified, 'wine')).toBe('20.00');
    expect(reclassified.discountAllocationMode).toBe('MANUAL');
    expect(sumOf(reclassified)).toBe('20.00');
  });

  /**
   * A batch is judged by the state it ends in, not by the states it passes
   * through. Flipping both lines leaves no company line halfway through, but
   * the result has one, so the operation is legitimate.
   */
  it('applies a whole batch before reattributing, so a valid flip is not rejected', () => {
    const before = mixedPurchase('COMPANY_ONLY', '12.00');

    const flipped = before.classifyItems([
      {
        itemId: 'flour',
        classification: { isCompanyExpense: false, isStockMaterial: false, materialId: null },
      },
      {
        itemId: 'wine',
        classification: { isCompanyExpense: true, isStockMaterial: false, materialId: null },
      },
    ]);

    expect(allocationOf(flipped, 'wine')).toBe('12.00');
    expect(allocationOf(flipped, 'flour')).toBe('0.00');
    expect(sumOf(flipped)).toBe('12.00');
  });

  /**
   * The same shape on a single-line note: re-sending a body that names the
   * line twice ends with it personal, which PERSONAL_ONLY needs.
   */
  it('lets a batch move the only line back into the eligible group', () => {
    const single = purchase({
      items: [
        item({
          id: 'only',
          grossValue: money('50.00'),
          unitPrice: money('50.00'),
          isCompanyExpense: false,
        }),
      ],
      discountTotal: money('5.00'),
      allocationPending: true,
    }).changeDiscountAllocation('PERSONAL_ONLY');

    const reapplied = single.classifyItems([
      {
        itemId: 'only',
        classification: { isCompanyExpense: true, isStockMaterial: false, materialId: null },
      },
      {
        itemId: 'only',
        classification: { isCompanyExpense: false, isStockMaterial: false, materialId: null },
      },
    ]);

    expect(allocationOf(reapplied, 'only')).toBe('5.00');
  });

  it('switches the mode in the same operation as the classification', () => {
    const switched = mixedPurchase('COMPANY_ONLY', '12.00').classifyItems(
      [
        {
          itemId: 'flour',
          classification: { isCompanyExpense: false, isStockMaterial: false, materialId: null },
        },
      ],
      { mode: 'PERSONAL_ONLY' },
    );

    expect(switched.discountAllocationMode).toBe('PERSONAL_ONLY');
    expect(sumOf(switched)).toBe('12.00');
  });

  it('changes nothing when the batch names an unknown line', () => {
    const before = mixedPurchase('COMPANY_ONLY', '12.00');

    expect(() =>
      before.classifyItems([
        {
          itemId: 'nope',
          classification: { isCompanyExpense: false, isStockMaterial: false, materialId: null },
        },
      ]),
    ).toThrow(InvalidPurchaseError);
    expect(allocationOf(before, 'flour')).toBe('12.00');
  });

  it('rejects an item that is not part of this purchase', () => {
    expect(() =>
      purchase().classifyItem('nope', {
        isCompanyExpense: true,
        isStockMaterial: false,
        materialId: null,
      }),
    ).toThrow(InvalidPurchaseError);
  });
});

describe('Purchase edits under MANUAL', () => {
  /**
   * There is no recomputation available: the system cannot know where the
   * discount of a removed line should go, nor how much a new line deserves.
   */
  it('removing a line leaves the attribution pending', () => {
    const edited = mixedPurchase('MANUAL').removeItem('flour');

    expect(edited.allocationPending).toBe(true);
  });

  it('adding a line leaves the attribution pending', () => {
    const edited = mixedPurchase('MANUAL').addItem({
      id: 'new',
      code: 'x',
      description: 'Açúcar',
      quantity: 1,
      unit: 'UND9',
      unitPrice: money('5.00'),
      grossValue: money('5.00'),
      isCompanyExpense: true,
      isStockMaterial: false,
      materialId: null,
    });

    expect(edited.allocationPending).toBe(true);
  });

  /**
   * The per-line ceiling moved: a line worth 50 carrying 10 of discount that
   * is corrected to 8 would be holding more discount than it is worth.
   */
  it('changing a line value leaves the attribution pending', () => {
    const edited = mixedPurchase('MANUAL').changeItemValue('wine', {
      grossValue: money('80.00'),
      unitPrice: money('80.00'),
    });

    expect(edited.allocationPending).toBe(true);
  });

  it('blocks completing the edit while the attribution is pending', () => {
    expect(() => mixedPurchase('MANUAL').removeItem('flour').completeEdit()).toThrow(
      PendingDiscountAllocationError,
    );
  });

  it('keeps the purchase out of the spending panel while pending', () => {
    expect(mixedPurchase('MANUAL').removeItem('flour').isCountedInSpending).toBe(false);
    expect(mixedPurchase('MANUAL').isCountedInSpending).toBe(true);
  });

  it('lets the edit complete once the user restates the attribution', () => {
    const pending = mixedPurchase('MANUAL').removeItem('flour');

    const restated = pending.changeDiscountAllocation(
      'MANUAL',
      new Map([['wine', money('20.00')]]),
    );

    expect(restated.allocationPending).toBe(false);
    expect(() => restated.completeEdit()).not.toThrow();
    expect(sumOf(restated)).toBe('20.00');
  });
});

describe('Purchase edits outside MANUAL', () => {
  it('reattributes by itself and the sum closes again', () => {
    const edited = mixedPurchase('PROPORTIONAL', '12.00').removeItem('wine');

    expect(edited.allocationPending).toBe(false);
    expect(allocationOf(edited, 'flour')).toBe('12.00');
    expect(sumOf(edited)).toBe('12.00');
    expect(() => edited.completeEdit()).not.toThrow();
  });

  it('restates the header totals to match the remaining lines', () => {
    const edited = mixedPurchase('PROPORTIONAL', '12.00').removeItem('wine');

    expect(edited.grossTotal.toDecimalString()).toBe('20.00');
    expect(edited.netTotal.toDecimalString()).toBe('8.00');
  });

  it('refuses an edit that would leave more discount than the purchase is worth', () => {
    expect(() => mixedPurchase('PROPORTIONAL', '100.00').removeItem('wine')).toThrow(
      DiscountAllocationError,
    );
  });
});

describe('Purchase on a note with no discount', () => {
  it('does not ask the user to choose', () => {
    const plain = purchase();

    expect(plain.hasDiscount).toBe(false);
    expect(plain.requiresDiscountAllocationChoice).toBe(false);
  });

  it('leaves every line at zero', () => {
    expect(sumOf(purchase())).toBe('0.00');
  });

  it('is counted in the spending panel', () => {
    expect(purchase().isCountedInSpending).toBe(true);
  });
});

function sumOf(p: Purchase): string {
  return p.items
    .reduce((total, line) => total.plus(line.allocatedDiscount), Money.zero())
    .toDecimalString();
}
