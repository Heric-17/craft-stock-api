import { IsIn, IsOptional } from 'class-validator';

import { PaginationQueryDto } from '../../../../shared/presentation/http/pagination-query.dto';
import {
  STOCK_ADJUSTMENT_KINDS,
  type StockAdjustmentKind,
} from '../../domain/stock-adjustment-kind.enum';

export class ListStockAdjustmentsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsIn(STOCK_ADJUSTMENT_KINDS)
  kind?: StockAdjustmentKind;
}
