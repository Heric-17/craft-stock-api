import { randomUUID } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';

import { UNIT_OF_WORK, type UnitOfWork } from '../../../../shared/domain/persistence/unit-of-work';
import type { Material } from '../../domain/material.entity';
import { MaterialNotFoundError, StockLossNotFoundError } from '../../domain/material.error';
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
  StockLossView,
} from '../dto/stock-losses.dto';
import { StockLossViewMapper } from '../mappers/stock-loss-view.mapper';

/**
 * Records the stock a Material lost, removes a loss recorded by mistake, and
 * reads the losses back: a paginated list and a dataset by dimension. Totals
 * come from the dataset, never from adding up pages.
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
        ...StockLossViewMapper.toView(loss, material),
        stockQuantityAfter: updated.stockQuantity,
      };
    });
  }

  /**
   * Removes a loss recorded by mistake. The stock is NOT touched: the loss
   * only leaves the list and the totals, and putting the quantity back is the
   * user's call (a count). Returns what was removed, so the screen can say how
   * much to put back.
   */
  async remove(lossId: string): Promise<StockLossView> {
    return this.unitOfWork.runInTransaction(async (ctx) => {
      const loss = await ctx.stockLosses.findById(lossId);

      if (!loss) {
        throw new StockLossNotFoundError(`StockLoss ${lossId} does not exist.`);
      }

      const material = await ctx.materials.findById(loss.materialId);

      if (!material) {
        throw new MaterialNotFoundError(`Material ${loss.materialId} does not exist.`);
      }

      await ctx.stockLosses.delete(lossId);

      return StockLossViewMapper.toView(loss, material);
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

    const materialsById = new Map<string, Material>();
    for (const materialId of new Set(page.losses.map((loss) => loss.materialId))) {
      const material = await this.materials.findById(materialId);

      if (!material) {
        throw new MaterialNotFoundError(`Material ${materialId} does not exist.`);
      }

      materialsById.set(materialId, material);
    }

    return {
      items: page.losses.map((loss) =>
        StockLossViewMapper.toView(loss, materialsById.get(loss.materialId) as Material),
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
