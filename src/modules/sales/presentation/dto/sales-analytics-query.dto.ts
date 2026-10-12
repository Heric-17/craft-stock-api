import { IsISO8601 } from 'class-validator';

/** Period the sales dataset is read over: `[from, to)`, on the instant a sale was created. */
export class SalesAnalyticsQueryDto {
  @IsISO8601()
  from!: string;

  /** Exclusive: a whole month is the first day of it and the first day of the next. */
  @IsISO8601()
  to!: string;
}
