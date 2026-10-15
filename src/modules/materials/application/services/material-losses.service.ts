import { Inject, Injectable } from '@nestjs/common';

import {
  STOCK_LOSS_DATASET_PORT,
  type StockLossDatasetPort,
} from '../../domain/ports/stock-loss-dataset.port';
import {
  MATERIAL_REPOSITORY,
  type MaterialRepository,
} from '../../domain/repositories/material.repository';
import {
  STOCK_ADJUSTMENT_REPOSITORY,
  type StockAdjustmentRepository,
} from '../../domain/repositories/stock-adjustment.repository';
import type {
  StockLossDatasetQueryInput,
  StockLossDatasetView,
  StockLossListInput,
  StockLossPageView,
} from '../dto/stock-adjustments.dto';
import { StockAdjustmentViewMapper } from '../mappers/stock-adjustment-view.mapper';

/**
 * Reading side of the losses: a paginated list and a dataset by dimension.
 * Totals come from the dataset, never from adding up pages.
 */
@Injectable()
export class MaterialLossesService {
  constructor(
    @Inject(STOCK_ADJUSTMENT_REPOSITORY)
    private readonly adjustments: StockAdjustmentRepository,
    @Inject(MATERIAL_REPOSITORY) private readonly materials: MaterialRepository,
    @Inject(STOCK_LOSS_DATASET_PORT) private readonly dataset: StockLossDatasetPort,
  ) {}

  async list(input: StockLossListInput): Promise<StockLossPageView> {
    const page = await this.adjustments.findLossPage({
      ...(input.from !== undefined ? { from: input.from } : {}),
      ...(input.to !== undefined ? { to: input.to } : {}),
      ...(input.materialId !== undefined ? { materialId: input.materialId } : {}),
      ...(input.reason !== undefined ? { reason: input.reason } : {}),
      limit: input.limit,
      offset: input.offset,
    });

    const names = new Map<string, string>();
    for (const materialId of new Set(page.entries.map((entry) => entry.loss.materialId))) {
      const material = await this.materials.findById(materialId);
      names.set(materialId, material?.name ?? materialId);
    }

    return {
      items: page.entries.map((entry) =>
        StockAdjustmentViewMapper.toLossView(
          entry.loss,
          names.get(entry.loss.materialId) as string,
          entry.reversedByAdjustmentId,
        ),
      ),
      total: page.total,
      limit: page.limit,
      offset: page.offset,
    };
  }

  async getDataset(query: StockLossDatasetQueryInput): Promise<StockLossDatasetView> {
    return StockAdjustmentViewMapper.toDatasetView(
      await this.dataset.lossDataset({ from: query.from, to: query.to }),
    );
  }
}
