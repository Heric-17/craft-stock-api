import {
  IsIn,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

import { MAX_OBSERVATION_LENGTH } from '../../domain/stock-adjustment.entity';
import { STOCK_LOSS_REASONS, type StockLossReason } from '../../domain/stock-loss-reason.enum';

/** Entries and count corrections go through `stock-entries`. */
export const RECORDABLE_ADJUSTMENT_KINDS = ['MANUAL_LOSS', 'REVERSAL'] as const;

export type RecordableAdjustmentKind = (typeof RECORDABLE_ADJUSTMENT_KINDS)[number];

/** A loss (`quantity`, `reason`) or a reversal (`reversedAdjustmentId`); the controller refuses mixed shapes. */
export class CreateStockAdjustmentDto {
  @IsIn(RECORDABLE_ADJUSTMENT_KINDS)
  kind!: RecordableAdjustmentKind;

  @ValidateIf((dto: CreateStockAdjustmentDto) => dto.kind === 'MANUAL_LOSS')
  @IsNumber({ maxDecimalPlaces: 3 })
  @IsPositive()
  quantity?: number;

  @ValidateIf((dto: CreateStockAdjustmentDto) => dto.kind === 'MANUAL_LOSS')
  @IsIn(STOCK_LOSS_REASONS)
  reason?: StockLossReason;

  @ValidateIf((dto: CreateStockAdjustmentDto) => dto.kind === 'REVERSAL')
  @IsString()
  @MinLength(1)
  reversedAdjustmentId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(MAX_OBSERVATION_LENGTH)
  observation?: string;
}
