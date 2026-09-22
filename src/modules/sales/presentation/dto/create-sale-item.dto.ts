import { IsNumber, IsOptional, IsPositive, IsString, Min, MinLength } from 'class-validator';

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
   * Percentage markup over the Material's `packageCost`, for a loose-Material
   * line only. Optional here and required by the service, which is where the
   * rule lives: it depends on which of the two references was sent, and `0`
   * is a valid value that has to be told apart from an absent one.
   */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  marginPercent?: number;
}
