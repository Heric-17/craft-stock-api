import { ArrayMinSize, IsArray, IsString } from 'class-validator';

/** Case 5: the set of selected Sales to aggregate material need for. */
export class ShoppingListDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  saleIds!: string[];
}
