import { IsBooleanString, IsOptional } from 'class-validator';

export class ListCompositeProductsQueryDto {
  @IsOptional()
  @IsBooleanString()
  includeDiscontinued?: string;
}
