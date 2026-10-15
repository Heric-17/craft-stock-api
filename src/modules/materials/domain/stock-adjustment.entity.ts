import type { Money } from '../../../shared/domain/money/money';
import { InvalidStockAdjustmentError } from './material.error';
import type { StockAdjustmentKind } from './stock-adjustment-kind.enum';
import type { StockLossReason } from './stock-loss-reason.enum';

export const MAX_OBSERVATION_LENGTH = 500;

export interface StockAdjustmentProps {
  id: string;
  materialId: string;
  kind: StockAdjustmentKind;
  /** The delta applied to the Material's stock, signed: a loss of one bottle is `-1`. */
  quantityDelta: number;
  /** Required for a `MANUAL_LOSS`, absent for every other kind. */
  reason: StockLossReason | null;
  observation: string | null;
  /**
   * The Material's `packageCost` and `packageQuantity` when this was recorded,
   * kept as a fraction: a `Money` holds whole cents, and a gram costs less.
   */
  costBasisAmount: Money;
  costBasisQuantity: number;
  /** Set on a `REVERSAL` only: the adjustment it undoes. */
  reversedAdjustmentId: string | null;
  createdAt: Date;
}

/**
 * One manual change to a Material's stock. Never edited or removed: a mistake
 * is corrected by a `REVERSAL` that points at the entry it undoes.
 */
export class StockAdjustment {
  readonly id: string;
  readonly materialId: string;
  readonly kind: StockAdjustmentKind;
  readonly quantityDelta: number;
  readonly reason: StockLossReason | null;
  readonly observation: string | null;
  readonly costBasisAmount: Money;
  readonly costBasisQuantity: number;
  readonly reversedAdjustmentId: string | null;
  readonly createdAt: Date;

  constructor(props: StockAdjustmentProps) {
    if (!Number.isFinite(props.quantityDelta) || props.quantityDelta === 0) {
      throw new InvalidStockAdjustmentError(
        'StockAdjustment quantityDelta must be a finite, non-zero number.',
      );
    }

    if (!Number.isFinite(props.costBasisQuantity) || props.costBasisQuantity <= 0) {
      throw new InvalidStockAdjustmentError(
        'StockAdjustment costBasisQuantity must be a finite number greater than zero.',
      );
    }

    if (props.costBasisAmount.isNegative()) {
      throw new InvalidStockAdjustmentError(
        'StockAdjustment costBasisAmount must not be negative.',
      );
    }

    if (props.observation !== null && props.observation.length > MAX_OBSERVATION_LENGTH) {
      throw new InvalidStockAdjustmentError(
        `StockAdjustment observation must have at most ${MAX_OBSERVATION_LENGTH} characters.`,
      );
    }

    StockAdjustment.assertKindRules(props);

    this.id = props.id;
    this.materialId = props.materialId;
    this.kind = props.kind;
    this.quantityDelta = props.quantityDelta;
    this.reason = props.reason;
    this.observation = props.observation;
    this.costBasisAmount = props.costBasisAmount;
    this.costBasisQuantity = props.costBasisQuantity;
    this.reversedAdjustmentId = props.reversedAdjustmentId;
    this.createdAt = props.createdAt;
  }

  /**
   * What the quantity was worth at the frozen cost, always positive:
   * `|quantityDelta| × costBasisAmount ÷ costBasisQuantity`, multiplied before
   * divided and rounded once. Derived on read, never persisted.
   */
  get value(): Money {
    return this.costBasisAmount.scaled(Math.abs(this.quantityDelta), this.costBasisQuantity);
  }

  /**
   * The entry that undoes `original`: the opposite delta at the cost basis
   * `original` froze, so a reversed loss nets to exactly zero. Whether it was
   * already reversed is for the repository to say.
   */
  static reversing(
    original: StockAdjustment,
    input: { id: string; observation: string | null; createdAt: Date },
  ): StockAdjustment {
    if (original.kind === 'REVERSAL') {
      throw new InvalidStockAdjustmentError(
        `StockAdjustment ${original.id} is itself a reversal and cannot be reversed.`,
      );
    }

    return new StockAdjustment({
      id: input.id,
      materialId: original.materialId,
      kind: 'REVERSAL',
      quantityDelta: -original.quantityDelta,
      reason: null,
      observation: input.observation,
      costBasisAmount: original.costBasisAmount,
      costBasisQuantity: original.costBasisQuantity,
      reversedAdjustmentId: original.id,
      createdAt: input.createdAt,
    });
  }

  private static assertKindRules(props: StockAdjustmentProps): void {
    const { kind, quantityDelta, reason, reversedAdjustmentId } = props;

    if (kind === 'MANUAL_LOSS') {
      if (quantityDelta > 0) {
        throw new InvalidStockAdjustmentError(
          'A MANUAL_LOSS must take stock out: its delta is negative.',
        );
      }
      if (reason === null) {
        throw new InvalidStockAdjustmentError('A MANUAL_LOSS requires a reason.');
      }
    } else if (reason !== null) {
      throw new InvalidStockAdjustmentError(
        `A ${kind} does not take a reason: only a MANUAL_LOSS does.`,
      );
    }

    if (kind === 'MANUAL_ENTRY' && quantityDelta < 0) {
      throw new InvalidStockAdjustmentError(
        'A MANUAL_ENTRY must put stock in: its delta is positive.',
      );
    }

    if (kind === 'REVERSAL') {
      if (reversedAdjustmentId === null) {
        throw new InvalidStockAdjustmentError(
          'A REVERSAL must reference the adjustment it undoes.',
        );
      }
    } else if (reversedAdjustmentId !== null) {
      throw new InvalidStockAdjustmentError(
        `A ${kind} cannot reference a reversed adjustment: only a REVERSAL does.`,
      );
    }
  }
}
