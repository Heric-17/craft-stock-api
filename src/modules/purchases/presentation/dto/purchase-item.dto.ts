import {
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Matches,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

import { MONEY_DECIMAL_PATTERN } from '../../../materials/presentation/dto/money-decimal.validator';
import {
  DISCOUNT_ALLOCATION_MODES,
  type DiscountAllocationMode,
} from '../../domain/discount-allocation-mode';

/**
 * A line of a purchase, as the client sends it.
 *
 * Both monetary fields arrive as decimal strings. A JSON `number` is a float,
 * and a total read back as `0.1` to be added up on the client reintroduces
 * exactly the error `Money` exists to prevent.
 */
export class PurchaseItemDto {
  @IsOptional()
  @IsString()
  code?: string | null;

  @IsString()
  @MinLength(1)
  description!: string;

  @IsNumber({ maxDecimalPlaces: 3 })
  @IsPositive()
  quantity!: number;

  /** The unit as the note printed it. Display only — it never feeds `packageQuantity`. */
  @IsOptional()
  @IsString()
  unit?: string | null;

  @IsString()
  @Matches(MONEY_DECIMAL_PATTERN, { message: 'unitPrice must be a decimal amount, e.g. "12.90"' })
  unitPrice!: string;

  /** The gross line value: always full price, whatever discount the purchase carries. */
  @IsString()
  @Matches(MONEY_DECIMAL_PATTERN, { message: 'grossValue must be a decimal amount, e.g. "12.90"' })
  grossValue!: string;

  @IsBoolean()
  isCompanyExpense!: boolean;

  /** The `Material` this line stocks, or null when it does not become stock. */
  @IsOptional()
  @IsUUID()
  materialId?: string | null;
}

export class EstablishmentDto {
  @IsString()
  @MinLength(1)
  name!: string;

  /** As printed on the note. Absent for a purchase entered by hand. */
  @IsOptional()
  @IsString()
  cnpj?: string | null;
}

/** What may be corrected on a line that is already recorded. */
export class ChangePurchaseItemDto {
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 3 })
  @IsPositive()
  quantity?: number;

  @IsOptional()
  @IsString()
  @Matches(MONEY_DECIMAL_PATTERN, { message: 'unitPrice must be a decimal amount, e.g. "12.90"' })
  unitPrice?: string;

  @IsOptional()
  @IsString()
  @Matches(MONEY_DECIMAL_PATTERN, { message: 'grossValue must be a decimal amount, e.g. "12.90"' })
  grossValue?: string;
}

/** One line's share of the discount, in `MANUAL`. */
export class ManualAllocationEntryDto {
  @IsUUID()
  itemId!: string;

  @IsString()
  @Matches(MONEY_DECIMAL_PATTERN, {
    message: 'allocatedDiscount must be a decimal amount, e.g. "1.50"',
  })
  allocatedDiscount!: string;
}

export class SetDiscountAllocationDto {
  @IsIn(DISCOUNT_ALLOCATION_MODES)
  mode!: DiscountAllocationMode;

  /** Required by `MANUAL`, refused by the modes that compute the amounts. */
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => ManualAllocationEntryDto)
  manualAllocation?: ManualAllocationEntryDto[];
}
