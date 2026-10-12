import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

/** How many rows a page holds when the caller does not say. */
export const DEFAULT_PAGE_SIZE = 20;

/**
 * An upper bound on the page, not a suggestion: without one, a caller asking
 * for every row ever recorded would load all of them into memory at once. A
 * limit above it is refused with a validation error, not trimmed.
 */
export const MAX_PAGE_SIZE = 100;

/** The window every paginated list takes; each list adds its own filters on top. */
export class PaginationQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_SIZE)
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;
}
