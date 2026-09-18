import { InvalidPurchaseError } from './purchase.error';

const ACCESS_KEY_PATTERN = /^\d{44}$/;

export interface PurchaseProps {
  id: string;
  purchaseDate: Date;
  /** NFC-e access key, 44 digits. Null for a purchase entered manually. Unique, used to deduplicate imports. */
  accessKey: string | null;
  /** Raw, immutable return of the NFC-e extraction. Never mutated after creation. */
  rawInvoiceData: Record<string, unknown> | null;
  createdAt: Date;
}

export class Purchase {
  readonly id: string;
  readonly purchaseDate: Date;
  readonly accessKey: string | null;
  readonly rawInvoiceData: Record<string, unknown> | null;
  readonly createdAt: Date;

  constructor(props: PurchaseProps) {
    if (props.accessKey !== null && !ACCESS_KEY_PATTERN.test(props.accessKey)) {
      throw new InvalidPurchaseError('Purchase accessKey must be exactly 44 digits.');
    }

    this.id = props.id;
    this.purchaseDate = props.purchaseDate;
    this.accessKey = props.accessKey;
    this.rawInvoiceData = props.rawInvoiceData;
    this.createdAt = props.createdAt;
  }
}
