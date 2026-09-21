import { IsIn, IsISO8601 } from 'class-validator';

import {
  SPENDING_GRANULARITIES,
  type SpendingGranularity,
} from '../../domain/ports/purchase-analytics.port';

/** Closed period the spending dataset is read over: `[from, to)`. */
export class SpendingQueryDto {
  @IsISO8601()
  from!: string;

  /** Exclusive: a whole month is the first day of it and the first day of the next. */
  @IsISO8601()
  to!: string;

  @IsIn(SPENDING_GRANULARITIES)
  granularity!: SpendingGranularity;
}
