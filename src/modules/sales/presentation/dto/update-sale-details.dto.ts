import { IsOptional, IsString, MinLength } from 'class-validator';

/** Every field optional: only the ones present are changed. Only valid while the Sale is still in PENDING production. */
export class UpdateSaleDetailsDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  customerName?: string;

  @IsOptional()
  @IsString()
  customerContact?: string | null;

  @IsOptional()
  @IsString()
  @MinLength(1)
  paymentMethod?: string;
}
