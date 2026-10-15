import { IsIn, IsISO8601, IsOptional, IsString, MinLength } from 'class-validator';

import { PaginationQueryDto } from '../../../../shared/presentation/http/pagination-query.dto';
import { STOCK_LOSS_REASONS, type StockLossReason } from '../../domain/stock-loss-reason.enum';

export class ListLossesQueryDto extends PaginationQueryDto {
  /** Inclusive lower bound on when the loss was recorded. */
  @IsOptional()
  @IsISO8601()
  from?: string;

  /** Exclusive upper bound on when the loss was recorded. */
  @IsOptional()
  @IsISO8601()
  to?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  materialId?: string;

  @IsOptional()
  @IsIn(STOCK_LOSS_REASONS)
  reason?: StockLossReason;
}
