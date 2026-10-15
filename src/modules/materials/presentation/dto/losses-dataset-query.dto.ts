import { IsISO8601 } from 'class-validator';

/** Period `[from, to)`, on the instant a loss was recorded. */
export class LossesDatasetQueryDto {
  @IsISO8601()
  from!: string;

  @IsISO8601()
  to!: string;
}
