import { IsIn, IsNumber, IsOptional, IsPositive, IsString, MaxLength } from 'class-validator';

import { MAX_OBSERVATION_LENGTH } from '../../domain/stock-loss.entity';
import { STOCK_LOSS_REASONS, type StockLossReason } from '../../domain/stock-loss-reason.enum';

export class CreateStockLossDto {
  /** Positive, in the Material's consumption unit. */
  @IsNumber({ maxDecimalPlaces: 3 })
  @IsPositive()
  quantity!: number;

  @IsIn(STOCK_LOSS_REASONS)
  reason!: StockLossReason;

  @IsOptional()
  @IsString()
  @MaxLength(MAX_OBSERVATION_LENGTH)
  observation?: string;
}
