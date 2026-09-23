import { IsIn, IsISO8601, IsOptional, IsString, MinLength } from 'class-validator';

import { SPENDING_GRANULARITIES, type SpendingGranularity } from '../../domain/spending-period';

/** Closed period the spending dataset is read over: `[from, to)`. */
export class SpendingQueryDto {
  @IsISO8601()
  from!: string;

  /** Exclusive: a whole month is the first day of it and the first day of the next. */
  @IsISO8601()
  to!: string;

  @IsIn(SPENDING_GRANULARITIES)
  granularity!: SpendingGranularity;

  /**
   * Narrows the whole dataset to one shop, keyed exactly as the dataset
   * reports it back — so a row of the ranking can be clicked straight into
   * both a narrowed panel and a filtered listing.
   */
  @IsOptional()
  @IsString()
  @MinLength(1)
  establishmentId?: string;
}
