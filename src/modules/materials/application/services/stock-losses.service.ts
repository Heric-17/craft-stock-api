import { randomUUID } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';

import { UNIT_OF_WORK, type UnitOfWork } from '../../../../shared/domain/persistence/unit-of-work';
import { MaterialNotFoundError } from '../../domain/material.error';
import {
  STOCK_LOSS_DATASET_PORT,
  type StockLossDatasetPort,
} from '../../domain/ports/stock-loss-dataset.port';
import {
  MATERIAL_REPOSITORY,
  type MaterialRepository,
} from '../../domain/repositories/material.repository';
import {
  STOCK_LOSS_REPOSITORY,
  type StockLossRepository,
} from '../../domain/repositories/stock-loss.repository';
import { StockLoss } from '../../domain/stock-loss.entity';
import type {
  RecordStockLossInput,
  StockLossDatasetQueryInput,
  StockLossDatasetView,
  StockLossListInput,
  StockLossPageView,
  StockLossResultView,
} from '../dto/stock-losses.dto';
import { StockLossViewMapper } from '../mappers/stock-loss-view.mapper';

/**
 * Records the stock a Material lost, and reads the losses back: a paginated
 * list and a dataset by dimension. Totals come from the dataset, never from
 * adding up pages.
 */
@Injectable()
export class StockLossesService {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: UnitOfWork,
    @Inject(STOCK_LOSS_REPOSITORY) private readonly losses: StockLossRepository,
    @Inject(MATERIAL_REPOSITORY) private readonly materials: MaterialRepository,
    @Inject(STOCK_LOSS_DATASET_PORT) private readonly dataset: StockLossDatasetPort,
  ) {}

  /**
   * Takes the quantity out of stock and records the loss at the Material's
   * current cost, in one transaction. A loss above the balance is refused and
   * nothing is written.
   */
  async record(materialId: string, input: RecordStockLossInput): Promise<StockLossResultView> {
    return this.unitOfWork.runInTransaction(async (ctx) => {
      const now = new Date();
      const material = await ctx.materials.findById(materialId);

      if (!material) {
        throw new MaterialNotFoundError(`Material ${materialId} does not exist.`);
      }

      const loss = new StockLoss({
        id: randomUUID(),
        materialId,
        quantity: input.quantity,
        reason: input.reason,
        observation: normalizeObservation(input.observation),
        costBasisAmount: material.packageCost,
        costBasisQuantity: material.packageQuantity,
        createdAt: now,
      });
      const updated = material.applyStockDelta(-loss.quantity, now);

      await ctx.materials.save(updated);
      await ctx.stockLosses.save(loss);

      return {
        ...StockLossViewMapper.toView(loss, material.name),
        stockQuantityAfter: updated.stockQuantity,
      };
    });
  }

  async list(input: StockLossListInput): Promise<StockLossPageView> {
    const page = await this.losses.findPage({
      ...(input.from !== undefined ? { from: input.from } : {}),
      ...(input.to !== undefined ? { to: input.to } : {}),
      ...(input.materialId !== undefined ? { materialId: input.materialId } : {}),
      ...(input.reason !== undefined ? { reason: input.reason } : {}),
      limit: input.limit,
      offset: input.offset,
    });

    const names = new Map<string, string>();
    for (const materialId of new Set(page.losses.map((loss) => loss.materialId))) {
      const material = await this.materials.findById(materialId);
      names.set(materialId, material?.name ?? materialId);
    }

    return {
      items: page.losses.map((loss) =>
        StockLossViewMapper.toView(loss, names.get(loss.materialId) as string),
      ),
      total: page.total,
      limit: page.limit,
      offset: page.offset,
    };
  }

  async getDataset(query: StockLossDatasetQueryInput): Promise<StockLossDatasetView> {
    return StockLossViewMapper.toDatasetView(
      await this.dataset.lossDataset({ from: query.from, to: query.to }),
    );
  }
}

function normalizeObservation(observation: string | undefined | null): string | null {
  const trimmed = observation?.trim() ?? '';

  return trimmed.length === 0 ? null : trimmed;
}
