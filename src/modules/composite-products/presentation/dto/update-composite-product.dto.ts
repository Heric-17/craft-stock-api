import { Type } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

import { BomItemDto } from './bom-item.dto';
import { MONEY_DECIMAL_PATTERN } from './money-decimal.validator';

/**
 * Every field optional: only the ones present are changed. `manualPrice`
 * follows the description/imageUrl convention — omitted leaves it untouched,
 * `null` clears it back to the suggested price. `billOfMaterials`, when
 * present, fully replaces the recipe.
 */
export class UpdateCompositeProductDto {
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
  @Matches(MONEY_DECIMAL_PATTERN, {
    message: 'fixedOperationalCost must be a decimal amount, e.g. "2.50"',
  })
  fixedOperationalCost?: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  profitMargin?: number;

  @IsOptional()
  @IsString()
  @Matches(MONEY_DECIMAL_PATTERN, { message: 'manualPrice must be a decimal amount, e.g. "45.00"' })
  manualPrice?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayUnique((item: BomItemDto) => item.materialId)
  @ValidateNested({ each: true })
  @Type(() => BomItemDto)
  billOfMaterials?: BomItemDto[];
}
