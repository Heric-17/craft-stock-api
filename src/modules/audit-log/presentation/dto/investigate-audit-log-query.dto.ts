import { IsOptional, IsString, MinLength } from 'class-validator';

export class InvestigateAuditLogQueryDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  transactionId?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  correlationId?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  errorId?: string;
}
