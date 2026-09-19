import { IsOptional, IsString, MinLength } from 'class-validator';

export class SearchMaterialsQueryDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;
}
