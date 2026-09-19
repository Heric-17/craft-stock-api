import { IsIn, IsNumber, IsOptional, IsString, Matches, Min } from 'class-validator';

import type { StockEntrySource } from '../../application/dto/materials.dto';
import { MONEY_DECIMAL_PATTERN } from './money-decimal.validator';

const STOCK_ENTRY_SOURCES: StockEntrySource[] = ['MANUAL', 'INVOICE_SYNC'];

/**
 * Exactly one of `relativeIncrement` / `absoluteQuantity` must be sent — the
 * controller checks this, since it is a shape rule about the command, not a
 * `Material` invariant.
 */
export class StockEntryDto {
  @IsIn(STOCK_ENTRY_SOURCES)
  source!: StockEntrySource;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 3 })
  relativeIncrement?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  absoluteQuantity?: number;

  @IsOptional()
  @IsString()
  @Matches(MONEY_DECIMAL_PATTERN, {
    message: 'invoicePackageCost must be a decimal amount, e.g. "12.90"',
  })
  invoicePackageCost?: string;
}
