import {
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Max,
  Min,
  MinLength,
} from 'class-validator';

import { MAX_MARGIN_BASIS_POINTS } from '../../../../shared/domain/money/margin';

/** Exactly one of `compositeProductId` / `materialId` must be sent — the service checks this, since it is a shape rule about the command, not a `SaleItem` invariant alone. */
export class CreateSaleItemDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  compositeProductId?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  materialId?: string;

  @IsNumber({ maxDecimalPlaces: 3 })
  @IsPositive()
  quantity!: number;

  /**
   * Markup over the Material's `packageCost` in whole basis points (`5000` is
   * 50%, `0` sells at cost), for a loose-Material line only. Optional here and required by the service, which is where the
   * rule lives: it depends on which of the two references was sent, and `0`
   * is a valid value that has to be told apart from an absent one.
   */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_MARGIN_BASIS_POINTS)
  marginBasisPoints?: number;
}
