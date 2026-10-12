import { Inject, Injectable } from '@nestjs/common';

import {
  MATERIAL_INVENTORY_SUMMARY_PORT,
  type MaterialInventorySummaryPort,
} from '../../domain/ports/material-inventory-summary.port';
import type { MaterialInventorySummaryView } from '../dto/materials.dto';

@Injectable()
export class MaterialInventoryService {
  constructor(
    @Inject(MATERIAL_INVENTORY_SUMMARY_PORT)
    private readonly inventory: MaterialInventorySummaryPort,
  ) {}

  async getSummary(includeDiscontinued = false): Promise<MaterialInventorySummaryView> {
    const summary = await this.inventory.summary({ includeDiscontinued });

    return {
      materialCount: summary.materialCount,
      belowMinimumCount: summary.belowMinimumCount,
      totalStockValue: summary.totalStockValue.toDecimalString(),
    };
  }
}
