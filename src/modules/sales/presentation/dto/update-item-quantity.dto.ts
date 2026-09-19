import { IsNumber, IsPositive } from 'class-validator';

export class UpdateItemQuantityDto {
  @IsNumber({ maxDecimalPlaces: 3 })
  @IsPositive()
  quantity!: number;
}
