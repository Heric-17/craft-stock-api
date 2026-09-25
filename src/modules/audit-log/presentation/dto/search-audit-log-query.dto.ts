import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min, MinLength } from 'class-validator';

import { MAX_AUDIT_LOG_PAGE_SIZE } from '../../application/services/audit-log.service';

const OPERATIONS = ['CREATE', 'UPDATE', 'DELETE'] as const;

export class SearchAuditLogQueryDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  entityType?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  entityId?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  transactionId?: string;

  @IsOptional()
  @IsIn(OPERATIONS)
  operation?: (typeof OPERATIONS)[number];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_AUDIT_LOG_PAGE_SIZE)
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;
}
