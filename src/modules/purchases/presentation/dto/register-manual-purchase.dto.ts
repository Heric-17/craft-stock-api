import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsISO8601,
  IsOptional,
  IsString,
  Matches,
  ValidateNested,
} from 'class-validator';

import { MONEY_DECIMAL_PATTERN } from '../../../materials/presentation/dto/money-decimal.validator';
import {
  DISCOUNT_ALLOCATION_MODES,
  type DiscountAllocationMode,
} from '../../domain/discount-allocation-mode';
import { EstablishmentDto, PurchaseItemDto } from './purchase-item.dto';

/**
 * A purchase typed in by hand, with no note behind it.
 *
 * It carries no header total: there is no issuer's figure to reconcile the
 * lines against, so the total is their sum. `discountTotal` is the whole
 * discount given on the purchase, and it is attributed across the lines by
 * the aggregate root, exactly as an imported note's is.
 */
export class RegisterManualPurchaseDto {
  @IsISO8601()
  purchaseDate!: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => EstablishmentDto)
  establishment?: EstablishmentDto;

  @IsOptional()
  @IsString()
  @Matches(MONEY_DECIMAL_PATTERN, {
    message: 'discountTotal must be a decimal amount, e.g. "5.00"',
  })
  discountTotal?: string;

  /**
   * `MANUAL` is not available here: it attributes by line id, and the ids
   * are minted while the purchase is being created. Set it afterwards, on
   * the purchase.
   */
  @IsOptional()
  @IsIn(DISCOUNT_ALLOCATION_MODES)
  discountAllocationMode?: DiscountAllocationMode;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PurchaseItemDto)
  lines!: PurchaseItemDto[];
}
