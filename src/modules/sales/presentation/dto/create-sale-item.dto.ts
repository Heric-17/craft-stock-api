import { IsNumber, IsOptional, IsPositive, IsString, MinLength } from 'class-validator';

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
}
