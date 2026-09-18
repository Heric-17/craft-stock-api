import type { Money } from '../../../shared/domain/money/money';
import { InvalidMaterialError } from './material.error';
import type { PriceChangeOrigin } from './price-change-origin.enum';

export interface MaterialPriceHistoryProps {
  id: string;
  materialId: string;
  previousValue: Money;
  newValue: Money;
  origin: PriceChangeOrigin;
  changedAt: Date;
}

/** One recorded change of a Material's `packageCost`. */
export class MaterialPriceHistory {
  readonly id: string;
  readonly materialId: string;
  readonly previousValue: Money;
  readonly newValue: Money;
  readonly origin: PriceChangeOrigin;
  readonly changedAt: Date;

  constructor(props: MaterialPriceHistoryProps) {
    if (props.previousValue.equals(props.newValue)) {
      throw new InvalidMaterialError(
        'MaterialPriceHistory requires previousValue and newValue to differ.',
      );
    }

    this.id = props.id;
    this.materialId = props.materialId;
    this.previousValue = props.previousValue;
    this.newValue = props.newValue;
    this.origin = props.origin;
    this.changedAt = props.changedAt;
  }
}
