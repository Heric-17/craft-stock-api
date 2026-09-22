import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

import { MONEY_DECIMAL_PATTERN } from '../../../composite-products/presentation/dto/money-decimal.validator';
import {
  CONSUMPTION_UNITS,
  type ConsumptionUnit,
} from '../../../materials/domain/consumption-unit';
import {
  DISCOUNT_ALLOCATION_MODES,
  type DiscountAllocationMode,
} from '../../../purchases/domain/discount-allocation-mode';

export class NewMaterialDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  /**
   * Required: the unit the new Material is consumed by. The note's own unit
   * never fills this in — it says how the item was rung up at the till.
   */
  @IsIn(CONSUMPTION_UNITS, {
    message: `consumptionUnit must be one of: ${CONSUMPTION_UNITS.join(', ')}`,
  })
  consumptionUnit!: ConsumptionUnit;

  @IsOptional()
  @IsNumber()
  @Min(0)
  minimumStockAlert?: number;
}

export class ClassifyInvoiceItemDto {
  @IsString()
  itemId!: string;

  @IsBoolean()
  isCompanyExpense!: boolean;

  @IsBoolean()
  isStockMaterial!: boolean;

  @IsOptional()
  @IsString()
  materialId?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => NewMaterialDto)
  newMaterial?: NewMaterialDto;

  /**
   * How much of the consumption unit one package holds. Required for a stock
   * line, and always the user's answer: the note's own unit describes how the
   * item was rung up, not how it is consumed.
   */
  @IsOptional()
  @IsNumber()
  @IsPositive()
  packageQuantity?: number;
}

export class ManualAllocationEntryDto {
  @IsString()
  itemId!: string;

  @Matches(MONEY_DECIMAL_PATTERN, {
    message: 'allocatedDiscount must be a non-negative amount with at most two decimal places',
  })
  allocatedDiscount!: string;
}

export class ClassifyInvoiceDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ClassifyInvoiceItemDto)
  items!: ClassifyInvoiceItemDto[];

  /** Only consulted when the note carries a discount. */
  @IsOptional()
  @IsIn(DISCOUNT_ALLOCATION_MODES)
  discountAllocationMode?: DiscountAllocationMode;

  /** Required by, and only by, `MANUAL`. */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ManualAllocationEntryDto)
  manualAllocation?: ManualAllocationEntryDto[];
}
