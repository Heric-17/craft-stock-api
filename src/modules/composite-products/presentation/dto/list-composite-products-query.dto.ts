import { IsBooleanString, IsOptional } from 'class-validator';

export class ListCompositeProductsQueryDto {
  /** Active CompositeProducts only by default — see CLAUDE.md section 9. */
  @IsOptional()
  @IsBooleanString()
  includeDiscontinued?: string;
}
