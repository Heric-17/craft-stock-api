import { IsISO8601, IsOptional, IsString, MinLength } from 'class-validator';

import { PaginationQueryDto } from '../../../../shared/presentation/http/pagination-query.dto';

export class ListPurchasesQueryDto extends PaginationQueryDto {
  /** Inclusive lower bound on the purchase date. */
  @IsOptional()
  @IsISO8601()
  from?: string;

  /** Exclusive upper bound on the purchase date. */
  @IsOptional()
  @IsISO8601()
  to?: string;

  /** The shop, keyed as the spending dataset reports it: its CNPJ, or its name. */
  @IsOptional()
  @IsString()
  @MinLength(1)
  establishmentId?: string;
}
