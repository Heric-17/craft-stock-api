import { InvalidSaleError } from './sale.error';

export interface StockMovementSnapshotProps {
  id: string;
  saleId: string;
  materialId: string;
  /** Exactly how much of the Material was debited from stock for this sale, allowing an exact reversal. */
  quantityDebited: number;
  createdAt: Date;
}

export class StockMovementSnapshot {
  readonly id: string;
  readonly saleId: string;
  readonly materialId: string;
  readonly quantityDebited: number;
  readonly createdAt: Date;

  constructor(props: StockMovementSnapshotProps) {
    if (!Number.isFinite(props.quantityDebited) || props.quantityDebited <= 0) {
      throw new InvalidSaleError(
        'StockMovementSnapshot quantityDebited must be a finite number greater than zero.',
      );
    }

    this.id = props.id;
    this.saleId = props.saleId;
    this.materialId = props.materialId;
    this.quantityDebited = props.quantityDebited;
    this.createdAt = props.createdAt;
  }
}
