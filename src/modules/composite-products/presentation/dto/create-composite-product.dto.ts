import { Type } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

import { MAX_MARGIN_BASIS_POINTS } from '../../../../shared/domain/money/margin';
import { BomItemDto } from './bom-item.dto';
import { MONEY_DECIMAL_PATTERN } from './money-decimal.validator';

export class CreateCompositeProductDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsString()
  @Matches(MONEY_DECIMAL_PATTERN, {
    message: 'fixedOperationalCost must be a decimal amount, e.g. "2.50"',
  })
  fixedOperationalCost!: string;

  /**
   * Margin in whole basis points: 33,33% is `3333`, 100% is `10000`. A
   * transport and calculation representation only; the screen still shows and
   * accepts a percentage. Capped at what the column holds, 999,99%.
   */
  @IsInt()
  @Min(0)
  @Max(MAX_MARGIN_BASIS_POINTS)
  profitMarginBasisPoints!: number;

  @IsOptional()
  @IsString()
  @Matches(MONEY_DECIMAL_PATTERN, { message: 'manualPrice must be a decimal amount, e.g. "45.00"' })
  manualPrice?: string | null;

  @IsArray()
  @ArrayUnique((item: BomItemDto) => item.materialId)
  @ValidateNested({ each: true })
  @Type(() => BomItemDto)
  billOfMaterials!: BomItemDto[];
}
