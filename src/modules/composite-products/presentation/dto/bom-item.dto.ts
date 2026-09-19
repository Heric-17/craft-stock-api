import { IsNumber, IsPositive, IsString, MinLength } from 'class-validator';

export class BomItemDto {
  @IsString()
  @MinLength(1)
  materialId!: string;

  @IsNumber({ maxDecimalPlaces: 3 })
  @IsPositive()
  quantity!: number;
}
