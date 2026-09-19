import { IsIn } from 'class-validator';

import { PRODUCTION_STATUSES, type ProductionStatus } from '../../domain/production-status.enum';

export class UpdateProductionStatusDto {
  @IsIn(PRODUCTION_STATUSES)
  productionStatus!: ProductionStatus;
}
