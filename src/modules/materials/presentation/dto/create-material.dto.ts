import {
  IsIn,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Matches,
  Min,
  MinLength,
} from 'class-validator';

import { CONSUMPTION_UNITS, type ConsumptionUnit } from '../../domain/consumption-unit';
import { MONEY_DECIMAL_PATTERN } from './money-decimal.validator';

export class CreateMaterialDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsString()
  @Matches(MONEY_DECIMAL_PATTERN, { message: 'packageCost must be a decimal amount, e.g. "12.90"' })
  packageCost!: string;

  /** How much of `consumptionUnit` one purchased package holds: 1000 for a 1 kg bag measured in grams. */
  @IsNumber({ maxDecimalPlaces: 3 })
  @IsPositive()
  packageQuantity!: number;

  /**
   * Required: the unit this Material is consumed by. Nothing infers it, and
   * changing it later is refused once there is stock or a `BomItem` using it.
   */
  @IsIn(CONSUMPTION_UNITS, {
    message: `consumptionUnit must be one of: ${CONSUMPTION_UNITS.join(', ')}`,
  })
  consumptionUnit!: ConsumptionUnit;

  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  stockQuantity!: number;

  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  minimumStockAlert!: number;
}
