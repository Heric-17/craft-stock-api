import { IsIn } from 'class-validator';

import { CONSUMPTION_UNITS, type ConsumptionUnit } from '../../domain/consumption-unit';

/**
 * Body of the dedicated consumption-unit change. It is not part of
 * `UpdateMaterialDto`: the unit reinterprets every quantity recorded against
 * the Material, so it is refused while any of them exists.
 */
export class ChangeConsumptionUnitDto {
  @IsIn(CONSUMPTION_UNITS, {
    message: `consumptionUnit must be one of: ${CONSUMPTION_UNITS.join(', ')}`,
  })
  consumptionUnit!: ConsumptionUnit;
}
