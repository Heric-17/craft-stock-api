import {
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Matches,
  Min,
  MinLength,
} from 'class-validator';

import { MONEY_DECIMAL_PATTERN } from './money-decimal.validator';

/** Every field optional: only the ones present are changed. `stockQuantity` is not editable here — see stock entries. */
export class UpdateMaterialDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsOptional()
  @IsString()
  imageUrl?: string | null;

  @IsOptional()
  @IsString()
  @Matches(MONEY_DECIMAL_PATTERN, { message: 'packageCost must be a decimal amount, e.g. "12.90"' })
  packageCost?: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 3 })
  @IsPositive()
  packageQuantity?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  minimumStockAlert?: number;
}
