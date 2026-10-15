import { randomUUID } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';

import { UNIT_OF_WORK, type UnitOfWork } from '../../../../shared/domain/persistence/unit-of-work';
import {
  InvalidStockAdjustmentError,
  MaterialNotFoundError,
  StockAdjustmentAlreadyReversedError,
  StockAdjustmentNotFoundError,
} from '../../domain/material.error';
import type { StockAdjustmentRepository } from '../../domain/repositories/stock-adjustment.repository';
import { StockAdjustment } from '../../domain/stock-adjustment.entity';
import type {
  RecordStockAdjustmentInput,
  StockAdjustmentResultView,
} from '../dto/stock-adjustments.dto';
import { StockAdjustmentViewMapper } from '../mappers/stock-adjustment-view.mapper';

/**
 * Records a loss, or reverses an earlier entry. Entries typed in and count
 * corrections are recorded by `MaterialsService.registerStockEntry`.
 *
 * The Material is read inside the transaction, so the balance checked is the
 * balance written. An entry that would take it below zero is refused and
 * nothing is written.
 */
@Injectable()
export class StockAdjustmentsService {
  constructor(@Inject(UNIT_OF_WORK) private readonly unitOfWork: UnitOfWork) {}

  async record(
    materialId: string,
    input: RecordStockAdjustmentInput,
  ): Promise<StockAdjustmentResultView> {
    return this.unitOfWork.runInTransaction(async (ctx) => {
      const now = new Date();
      const material = await ctx.materials.findById(materialId);

      if (!material) {
        throw new MaterialNotFoundError(`Material ${materialId} does not exist.`);
      }

      const adjustment =
        input.kind === 'MANUAL_LOSS'
          ? new StockAdjustment({
              id: randomUUID(),
              materialId,
              kind: 'MANUAL_LOSS',
              quantityDelta: -input.quantity,
              reason: input.reason,
              observation: normalizeObservation(input.observation),
              costBasisAmount: material.packageCost,
              costBasisQuantity: material.packageQuantity,
              reversedAdjustmentId: null,
              createdAt: now,
            })
          : await this.buildReversal(ctx.stockAdjustments, materialId, input, now);

      const updated = material.applyStockDelta(adjustment.quantityDelta, now);

      await ctx.materials.save(updated);
      await ctx.stockAdjustments.save(adjustment);

      return {
        ...StockAdjustmentViewMapper.toView(adjustment),
        stockQuantityAfter: updated.stockQuantity,
      };
    });
  }

  private async buildReversal(
    adjustments: StockAdjustmentRepository,
    materialId: string,
    input: Extract<RecordStockAdjustmentInput, { kind: 'REVERSAL' }>,
    now: Date,
  ): Promise<StockAdjustment> {
    const original = await adjustments.findById(input.reversedAdjustmentId);

    if (!original) {
      throw new StockAdjustmentNotFoundError(
        `StockAdjustment ${input.reversedAdjustmentId} does not exist.`,
      );
    }

    if (original.materialId !== materialId) {
      throw new InvalidStockAdjustmentError(
        `StockAdjustment ${original.id} belongs to another Material and cannot be reversed here.`,
      );
    }

    if ((await adjustments.findReversalOf(original.id)) !== null) {
      throw new StockAdjustmentAlreadyReversedError(
        `StockAdjustment ${original.id} was already reversed.`,
      );
    }

    return StockAdjustment.reversing(original, {
      id: randomUUID(),
      observation: normalizeObservation(input.observation),
      createdAt: now,
    });
  }
}

function normalizeObservation(observation: string | undefined | null): string | null {
  const trimmed = observation?.trim() ?? '';

  return trimmed.length === 0 ? null : trimmed;
}
