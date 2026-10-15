import type { Money } from '../../../shared/domain/money/money';
import { InvalidStockLossError } from './material.error';
import type { StockLossReason } from './stock-loss-reason.enum';

export const MAX_OBSERVATION_LENGTH = 500;

export interface StockLossProps {
  id: string;
  materialId: string;
  /** How much was lost, positive, in the Material's consumption unit. */
  quantity: number;
  reason: StockLossReason;
  observation: string | null;
  /**
   * The Material's `packageCost` and `packageQuantity` when the loss was
   * recorded, kept as a fraction: a `Money` holds whole cents, and a gram
   * costs less.
   */
  costBasisAmount: Money;
  costBasisQuantity: number;
  createdAt: Date;
}

/** Stock a Material lost (broken, expired, spoiled, missing). Never edited or removed. */
export class StockLoss {
  readonly id: string;
  readonly materialId: string;
  readonly quantity: number;
  readonly reason: StockLossReason;
  readonly observation: string | null;
  readonly costBasisAmount: Money;
  readonly costBasisQuantity: number;
  readonly createdAt: Date;

  constructor(props: StockLossProps) {
    if (!Number.isFinite(props.quantity) || props.quantity <= 0) {
      throw new InvalidStockLossError(
        'StockLoss quantity must be a finite number greater than zero.',
      );
    }

    if (!Number.isFinite(props.costBasisQuantity) || props.costBasisQuantity <= 0) {
      throw new InvalidStockLossError(
        'StockLoss costBasisQuantity must be a finite number greater than zero.',
      );
    }

    if (props.costBasisAmount.isNegative()) {
      throw new InvalidStockLossError('StockLoss costBasisAmount must not be negative.');
    }

    if (props.observation !== null && props.observation.length > MAX_OBSERVATION_LENGTH) {
      throw new InvalidStockLossError(
        `StockLoss observation must have at most ${MAX_OBSERVATION_LENGTH} characters.`,
      );
    }

    this.id = props.id;
    this.materialId = props.materialId;
    this.quantity = props.quantity;
    this.reason = props.reason;
    this.observation = props.observation;
    this.costBasisAmount = props.costBasisAmount;
    this.costBasisQuantity = props.costBasisQuantity;
    this.createdAt = props.createdAt;
  }

  /**
   * What was lost, in money, at the frozen cost:
   * `quantity × costBasisAmount ÷ costBasisQuantity`, multiplied before
   * divided and rounded once. Derived on read, never persisted.
   */
  get value(): Money {
    return this.costBasisAmount.scaled(this.quantity, this.costBasisQuantity);
  }
}
