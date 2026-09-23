import { Type } from 'class-transformer';
import { IsInt, IsISO8601, IsOptional, IsString, Max, Min, MinLength } from 'class-validator';

/** How many rows a page holds when the caller does not say. */
export const DEFAULT_PURCHASE_PAGE_SIZE = 20;

/**
 * An upper bound on the page, not a suggestion: without one, a caller asking
 * for every purchase ever recorded would load every aggregate, lines
 * included, into memory at once.
 */
export const MAX_PURCHASE_PAGE_SIZE = 100;

export class ListPurchasesQueryDto {
  /** Inclusive lower bound on the purchase date. */
  @IsOptional()
  @IsISO8601()
  from?: string;

  /** Exclusive upper bound on the purchase date. */
  @IsOptional()
  @IsISO8601()
  to?: string;

  /** The shop, keyed as the spending dataset reports it: its CNPJ, or its name. */
  @IsOptional()
  @IsString()
  @MinLength(1)
  establishmentId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PURCHASE_PAGE_SIZE)
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;
}
