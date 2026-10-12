import { IsBooleanString, IsOptional } from 'class-validator';

export class InventorySummaryQueryDto {
  /** Active Materials only by default. */
  @IsOptional()
  @IsBooleanString()
  includeDiscontinued?: string;
}
