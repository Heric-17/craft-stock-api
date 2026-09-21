import type { Money } from '../../../shared/domain/money/money';
import { InvalidPurchaseError } from './purchase.error';

const ACCESS_KEY_PATTERN = /^\d{44}$/;

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
  createdAt: Date;
}

export class Purchase {
  readonly id: string;
  readonly purchaseDate: Date;
  readonly accessKey: string | null;
  readonly rawInvoiceData: Record<string, unknown> | null;
  readonly grossTotal: Money;
  readonly discountTotal: Money;
  readonly netTotal: Money;
  readonly createdAt: Date;

  constructor(props: PurchaseProps) {
    if (props.accessKey !== null && !ACCESS_KEY_PATTERN.test(props.accessKey)) {
      throw new InvalidPurchaseError('Purchase accessKey must be exactly 44 digits.');
    }

    if (props.grossTotal.isNegative() || props.discountTotal.isNegative()) {
      throw new InvalidPurchaseError('Purchase grossTotal and discountTotal must not be negative.');
    }

    // The three totals are captured from the note rather than derived from
    // each other, so they are checked for consistency on the way in: a note
    // whose header does not close is a parsing failure, not a purchase.
    if (!props.netTotal.equals(props.grossTotal.minus(props.discountTotal))) {
      throw new InvalidPurchaseError(
        'Purchase netTotal must be exactly grossTotal minus discountTotal.',
      );
    }

    if (props.netTotal.isNegative()) {
      throw new InvalidPurchaseError('Purchase discountTotal must not exceed grossTotal.');
    }

    this.id = props.id;
    this.purchaseDate = props.purchaseDate;
    this.accessKey = props.accessKey;
    this.rawInvoiceData = props.rawInvoiceData;
    this.grossTotal = props.grossTotal;
    this.discountTotal = props.discountTotal;
    this.netTotal = props.netTotal;
    this.createdAt = props.createdAt;
  }

  /** Whether the note granted any discount at all. */
  get hasDiscount(): boolean {
    return !this.discountTotal.isZero();
  }
}
