import { Money } from '../../../shared/domain/money/money';
import {
  allocateDiscount,
  eligibleLines,
  sumAllocations,
  type ManualAllocation,
} from './discount-allocation';
import type { DiscountAllocationMode } from './discount-allocation-mode';
import { PurchaseItem, type PurchaseItemProps } from './purchase-item.entity';
import {
  DiscountAllocationDesyncError,
  DiscountAllocationError,
  InvalidPurchaseError,
  PendingDiscountAllocationError,
} from './purchase.error';

const ACCESS_KEY_PATTERN = /^\d{44}$/;

/** How a line may be reclassified. Only ever reachable through the root. */
export interface ItemClassification {
  isCompanyExpense: boolean;
  isStockMaterial: boolean;
  materialId: string | null;
}

/** What may change on an existing line's value. */
export interface ItemValueChange {
  quantity?: number;
  unitPrice?: Money;
  grossValue?: Money;
}

export interface PurchaseProps {
  id: string;
  purchaseDate: Date;
  /** NFC-e access key, 44 digits. Null for a purchase entered manually. Unique, used to deduplicate imports. */
  accessKey: string | null;
  /** Raw, immutable return of the NFC-e extraction. Never mutated after creation. */
  rawInvoiceData: Record<string, unknown> | null;
  /** Sum of the lines at full price — the replacement-cost side of the note. */
  grossTotal: Money;
  /** Discount the note granted over the whole purchase. */
  discountTotal: Money;
  /** What was actually paid: `grossTotal − discountTotal`. */
  netTotal: Money;
  discountAllocationMode: DiscountAllocationMode;
  /**
   * True while a `MANUAL` attribution has been invalidated by an edit and the
   * user has not restated it.
   */
  allocationPending: boolean;
  items: readonly PurchaseItem[];
  createdAt: Date;
}

/**
 * Aggregate root over its lines.
 *
 * It is a root and not a container because `allocatedDiscount` is a stored
 * value that depends on `isCompanyExpense`. If a line's classification could
 * be changed and saved on its own, it would leave discount attributed to a
 * line no longer in the eligible group: the totals would still close, no
 * invariant on the sum would fire, and the only symptom would be a wrong
 * figure on the spending panel. The correction cannot rest on a developer
 * remembering to reattribute, so the only ways in are `classifyItem` and
 * `changeDiscountAllocation`, both of which reattribute before they return,
 * and there is no `PurchaseItemRepository` through which a line could be
 * loaded and saved around them.
 */
export class Purchase {
  readonly id: string;
  readonly purchaseDate: Date;
  readonly accessKey: string | null;
  readonly rawInvoiceData: Record<string, unknown> | null;
  readonly grossTotal: Money;
  readonly discountTotal: Money;
  readonly netTotal: Money;
  readonly discountAllocationMode: DiscountAllocationMode;
  readonly allocationPending: boolean;
  readonly items: readonly PurchaseItem[];
  readonly createdAt: Date;

  constructor(props: PurchaseProps) {
    if (props.accessKey !== null && !ACCESS_KEY_PATTERN.test(props.accessKey)) {
      throw new InvalidPurchaseError('Purchase accessKey must be exactly 44 digits.');
    }

    if (props.grossTotal.isNegative() || props.discountTotal.isNegative()) {
      throw new InvalidPurchaseError('Purchase grossTotal and discountTotal must not be negative.');
    }

    if (!props.netTotal.equals(props.grossTotal.minus(props.discountTotal))) {
      throw new InvalidPurchaseError(
        'Purchase netTotal must be exactly grossTotal minus discountTotal.',
      );
    }

    if (props.netTotal.isNegative()) {
      throw new InvalidPurchaseError('Purchase discountTotal must not exceed grossTotal.');
    }

    const linesTotal = sumGross(props.items);

    // The header is captured from the note rather than recomputed from the
    // lines, so it is checked against them instead. A header that does not
    // close over its own lines means the note was read wrong, and attributing
    // the discount over it would spread that error into every cost downstream.
    if (props.items.length > 0 && !linesTotal.equals(props.grossTotal)) {
      throw new InvalidPurchaseError(
        `Purchase lines add up to ${linesTotal.toDecimalString()}, which does not match the reported grossTotal of ${props.grossTotal.toDecimalString()}.`,
      );
    }

    assertNoDiscountOutsideEligibleSet(props.items, props.discountAllocationMode);

    // While the attribution is pending the sum is expected not to close —
    // that gap is precisely the signal the user has to answer.
    if (!props.allocationPending) {
      const allocated = props.items.reduce(
        (total, item) => total.plus(item.allocatedDiscount),
        Money.zero(),
      );

      if (!allocated.equals(props.discountTotal)) {
        throw new DiscountAllocationError(
          `Attributed discount adds up to ${allocated.toDecimalString()}, which does not match the note's discountTotal of ${props.discountTotal.toDecimalString()}.`,
        );
      }
    }

    this.id = props.id;
    this.purchaseDate = props.purchaseDate;
    this.accessKey = props.accessKey;
    this.rawInvoiceData = props.rawInvoiceData;
    this.grossTotal = props.grossTotal;
    this.discountTotal = props.discountTotal;
    this.netTotal = props.netTotal;
    this.discountAllocationMode = props.discountAllocationMode;
    this.allocationPending = props.allocationPending;
    this.items = props.items;
    this.createdAt = props.createdAt;
  }

  /** Whether the note granted any discount at all. */
  get hasDiscount(): boolean {
    return !this.discountTotal.isZero();
  }

  /**
   * Whether the user has to be asked how to attribute the discount. A note
   * without a discount never raises the question: every line is zero and the
   * choice simply does not appear.
   */
  get requiresDiscountAllocationChoice(): boolean {
    return this.hasDiscount;
  }

  /**
   * Whether this purchase counts towards the spending panel. A purchase
   * whose manual attribution is still pending is left out on purpose: a
   * period computed with only part of the discount attributed reports a
   * spending figure that is wrong and looks fine.
   */
  get isCountedInSpending(): boolean {
    return !this.allocationPending;
  }

  findItem(itemId: string): PurchaseItem | null {
    return this.items.find((item) => item.id === itemId) ?? null;
  }

  /**
   * Reclassifies one line and reattributes the discount in the same
   * operation. Reattribution is not the caller's job and is not optional:
   * under `COMPANY_ONLY` and `PERSONAL_ONLY` the eligible set just changed,
   * and leaving it alone would strand discount on a line that fell out of
   * the group.
   *
   * `MANUAL` does not depend on the eligible set, so reclassifying preserves
   * what the user typed — but it still comes through here, so there is one
   * way in rather than two.
   */
  classifyItem(itemId: string, classification: ItemClassification): Purchase {
    return this.classifyItems([{ itemId, classification }]);
  }

  /**
   * Reclassifies several lines, and optionally switches the attribution mode,
   * as ONE operation.
   *
   * The batch matters. Reclassifying line by line would walk the purchase
   * through intermediate states that the final one never has: flipping two
   * lines under `COMPANY_ONLY` momentarily leaves no company line at all, and
   * moving a note's only line from personal to company under `PERSONAL_ONLY`
   * momentarily empties that group. Both are valid end to end and both would
   * be rejected halfway through. The eligible set is a property of the state
   * an operation ends in, so the flags are all applied first and the discount
   * is attributed exactly once, at the end.
   *
   * The mode belongs in the same call for the same reason: switching to
   * `PERSONAL_ONLY` while marking the lines that make it valid cannot be two
   * operations, or the first one is judged against the second one's premise.
   */
  classifyItems(
    changes: readonly { itemId: string; classification: ItemClassification }[],
    allocation?: { mode: DiscountAllocationMode; manual?: ManualAllocation },
  ): Purchase {
    // Every line is checked before any is touched, so a batch naming an
    // unknown line changes nothing at all.
    for (const change of changes) {
      if (this.findItem(change.itemId) === null) {
        throw new InvalidPurchaseError(`Purchase ${this.id} has no item ${change.itemId}.`);
      }
    }

    const byItemId = new Map(changes.map((change) => [change.itemId, change.classification]));

    const items = this.items.map((item) => {
      const classification = byItemId.get(item.id);

      return classification === undefined
        ? item
        : new PurchaseItem({
            ...item.toProps(),
            isCompanyExpense: classification.isCompanyExpense,
            isStockMaterial: classification.isStockMaterial,
            materialId: classification.materialId,
          });
    });

    const mode = allocation?.mode ?? this.discountAllocationMode;

    // `MANUAL` with nothing new typed keeps what the user typed before: the
    // amounts do not depend on the eligible set, so reclassifying cannot
    // invalidate them. The invariants are still checked on the way out.
    if (mode === 'MANUAL' && allocation?.manual === undefined) {
      return this.with({ items, discountAllocationMode: 'MANUAL' });
    }

    return this.withReallocation(items, mode, allocation?.manual);
  }

  /**
   * Switches how the discount is attributed, and attributes it. `MANUAL`
   * takes the amounts the user typed; every other mode computes them.
   */
  changeDiscountAllocation(mode: DiscountAllocationMode, manual?: ManualAllocation): Purchase {
    return this.reallocate(mode, manual);
  }

  /**
   * Adds a line. Under `MANUAL` this leaves the attribution pending: the
   * system has no way to know how much of the note's discount belongs to a
   * line that was not there when the user distributed it.
   */
  addItem(props: Omit<PurchaseItemProps, 'purchaseId' | 'allocatedDiscount'>): Purchase {
    const item = new PurchaseItem({
      ...props,
      purchaseId: this.id,
      allocatedDiscount: Money.zero(),
    });

    return this.restructure([...this.items, item]);
  }

  /**
   * Removes a line. Under `MANUAL` this leaves the attribution pending: the
   * discount the removed line was holding has nowhere to go that the system
   * can work out on its own.
   */
  removeItem(itemId: string): Purchase {
    if (this.findItem(itemId) === null) {
      throw new InvalidPurchaseError(`Purchase ${this.id} has no item ${itemId}.`);
    }

    return this.restructure(this.items.filter((item) => item.id !== itemId));
  }

  /**
   * Changes a line's quantity or value. Under `MANUAL` this leaves the
   * attribution pending too, and for a reason of its own: the per-line
   * ceiling moved. A line worth 50 carrying 10 of discount that is corrected
   * to 8 is now holding more discount than it is worth.
   */
  changeItemValue(itemId: string, change: ItemValueChange): Purchase {
    const target = this.findItem(itemId);

    if (target === null) {
      throw new InvalidPurchaseError(`Purchase ${this.id} has no item ${itemId}.`);
    }

    const props = target.toProps();
    const items = this.items.map((item) =>
      item.id === itemId
        ? new PurchaseItem({
            ...props,
            quantity: change.quantity ?? props.quantity,
            unitPrice: change.unitPrice ?? props.unitPrice,
            grossValue: change.grossValue ?? props.grossValue,
            // The ceiling may have just moved below what this line is
            // holding, so the attribution is dropped and restated by the user.
            allocatedDiscount: Money.zero(),
          })
        : item,
    );

    return this.restructure(items);
  }

  /**
   * Closes an edit. Refused while the manual attribution is pending: the
   * purchase must not be left with only part of its discount attributed,
   * because from that point on every figure derived from it is quietly wrong.
   */
  completeEdit(): Purchase {
    if (this.allocationPending) {
      const allocated = sumAllocations(
        this.items.map((item) => ({ id: item.id, allocatedDiscount: item.allocatedDiscount })),
      );

      throw new PendingDiscountAllocationError(
        `Purchase ${this.id} still has a pending manual discount allocation: its lines add up to ${allocated.toDecimalString()} against a discountTotal of ${this.discountTotal.toDecimalString()}. Restate the allocation before completing the edit.`,
      );
    }

    return this;
  }

  /**
   * Applies a structural change to the lines. Outside `MANUAL` the root
   * reattributes and the sum closes again by itself; under `MANUAL` there is
   * nothing to recompute, so the purchase is parked in pending attribution
   * and the user is asked.
   */
  private restructure(items: readonly PurchaseItem[]): Purchase {
    const grossTotal = sumGross(items);

    if (this.discountTotal.isGreaterThan(grossTotal)) {
      throw new DiscountAllocationError(
        `Removing or reducing lines would leave a discount of ${this.discountTotal.toDecimalString()} against a purchase worth ${grossTotal.toDecimalString()}.`,
      );
    }

    const totals = { grossTotal, netTotal: grossTotal.minus(this.discountTotal) };

    if (this.discountAllocationMode !== 'MANUAL') {
      return this.withReallocation(items, this.discountAllocationMode, undefined, totals);
    }

    return this.with({
      ...totals,
      items,
      allocationPending: !this.discountTotal.isZero(),
    });
  }

  private reallocate(mode: DiscountAllocationMode, manual?: ManualAllocation): Purchase {
    return this.withReallocation(this.items, mode, manual);
  }

  /**
   * Attributes the discount over `items` and returns the resulting purchase in
   * a single construction.
   *
   * Going through an intermediate `Purchase` would trip the desync invariant
   * on a state no operation ever leaves behind: after a line is reclassified
   * but before the discount has been moved. The invariant is about the state
   * an operation ends in, so that is the only state it is asked about.
   */
  private withReallocation(
    items: readonly PurchaseItem[],
    mode: DiscountAllocationMode,
    manual?: ManualAllocation,
    totals?: { grossTotal: Money; netTotal: Money },
  ): Purchase {
    const allocation = allocateDiscount(
      items.map((item) => ({
        id: item.id,
        grossValue: item.grossValue,
        isCompanyExpense: item.isCompanyExpense,
      })),
      this.discountTotal,
      mode,
      manual,
    );

    const byId = new Map(allocation.map((line) => [line.id, line.allocatedDiscount]));
    const allocated = items.map(
      (item) =>
        new PurchaseItem({
          ...item.toProps(),
          allocatedDiscount: byId.get(item.id) ?? Money.zero(),
        }),
    );

    return this.with({
      ...(totals ?? {}),
      items: allocated,
      discountAllocationMode: mode,
      allocationPending: false,
    });
  }

  private with(changes: Partial<PurchaseProps>): Purchase {
    return new Purchase({
      id: this.id,
      purchaseDate: this.purchaseDate,
      accessKey: this.accessKey,
      rawInvoiceData: this.rawInvoiceData,
      grossTotal: this.grossTotal,
      discountTotal: this.discountTotal,
      netTotal: this.netTotal,
      discountAllocationMode: this.discountAllocationMode,
      allocationPending: this.allocationPending,
      items: this.items,
      createdAt: this.createdAt,
      ...changes,
    });
  }
}

function sumGross(items: readonly PurchaseItem[]): Money {
  return items.reduce((total, item) => total.plus(item.grossValue), Money.zero());
}

/**
 * No line outside the current mode's eligible set may be holding discount.
 *
 * Every path that can move a line in or out of the group reattributes in the
 * same operation, so this can only be reached by a code path that found its
 * way around the root. It is a programming error, not a user error, and it
 * fails loudly rather than being quietly corrected — a silent correction
 * would hide exactly the bug this check exists to surface.
 */
function assertNoDiscountOutsideEligibleSet(
  items: readonly PurchaseItem[],
  mode: DiscountAllocationMode,
): void {
  const eligible = new Set(eligibleLines(items, mode).map((item) => item.id));

  for (const item of items) {
    if (!eligible.has(item.id) && !item.allocatedDiscount.isZero()) {
      throw new DiscountAllocationDesyncError(
        `PurchaseItem ${item.id} holds ${item.allocatedDiscount.toDecimalString()} of discount but is not eligible under ${mode}. The discount was not reattributed after the line was reclassified.`,
      );
    }
  }
}
