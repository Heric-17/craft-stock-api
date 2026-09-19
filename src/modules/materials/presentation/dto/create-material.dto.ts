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

export class CreateMaterialDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsOptional()
  @IsString()
  imageUrl?: string | null;

  @IsString()
  @Matches(MONEY_DECIMAL_PATTERN, { message: 'packageCost must be a decimal amount, e.g. "12.90"' })
  packageCost!: string;

  @IsNumber({ maxDecimalPlaces: 3 })
  @IsPositive()
  packageQuantity!: number;

  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  stockQuantity!: number;

  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  minimumStockAlert!: number;
}
