import { Inject, Injectable } from '@nestjs/common';

import { MaterialNotFoundError } from '../../domain/material.error';
import {
  MATERIAL_REPOSITORY,
  type MaterialRepository,
} from '../../domain/repositories/material.repository';
import {
  STOCK_ADJUSTMENT_REPOSITORY,
  type StockAdjustmentRepository,
} from '../../domain/repositories/stock-adjustment.repository';
import type {
  StockAdjustmentHistoryInput,
  StockAdjustmentHistoryPageView,
} from '../dto/stock-adjustments.dto';
import { StockAdjustmentViewMapper } from '../mappers/stock-adjustment-view.mapper';

/**
 * The complete history of one Material's manual stock changes, reversals
 * included. It is where a client finds the id of an entry it wants to reverse.
 */
@Injectable()
export class StockAdjustmentHistoryService {
  constructor(
    @Inject(STOCK_ADJUSTMENT_REPOSITORY)
    private readonly adjustments: StockAdjustmentRepository,
    @Inject(MATERIAL_REPOSITORY) private readonly materials: MaterialRepository,
  ) {}

  async list(input: StockAdjustmentHistoryInput): Promise<StockAdjustmentHistoryPageView> {
    if ((await this.materials.findById(input.materialId)) === null) {
      throw new MaterialNotFoundError(`Material ${input.materialId} does not exist.`);
    }

    const page = await this.adjustments.findHistoryPage({
      materialId: input.materialId,
      ...(input.kind !== undefined ? { kind: input.kind } : {}),
      limit: input.limit,
      offset: input.offset,
    });

    return {
      items: page.entries.map((entry) =>
        StockAdjustmentViewMapper.toHistoryItemView(entry.adjustment, entry.reversedByAdjustmentId),
      ),
      total: page.total,
      limit: page.limit,
      offset: page.offset,
    };
  }
}
