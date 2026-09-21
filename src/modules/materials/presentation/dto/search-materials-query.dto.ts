import { IsBooleanString, IsOptional, IsString, MinLength } from 'class-validator';

export class SearchMaterialsQueryDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  /** Active Materials only by default. */
  @IsOptional()
  @IsBooleanString()
  includeDiscontinued?: string;
}
