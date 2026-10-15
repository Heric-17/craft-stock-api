import {
  toDomainMoney,
  toPersistenceDecimal,
} from '../../../../../shared/infrastructure/persistence/money.mapper';
import type { StockAdjustmentModel } from '../../../../../shared/infrastructure/prisma/generated/models';
import { Prisma } from '../../../../../shared/infrastructure/prisma/generated/client';
import { StockAdjustment } from '../../../domain/stock-adjustment.entity';

export class StockAdjustmentMapper {
  static toDomain(row: StockAdjustmentModel): StockAdjustment {
    return new StockAdjustment({
      id: row.id,
      materialId: row.materialId,
      kind: row.kind,
      quantityDelta: row.quantityDelta.toNumber(),
      reason: row.reason,
      observation: row.observation,
      costBasisAmount: toDomainMoney(row.costBasisAmount),
      costBasisQuantity: row.costBasisQuantity.toNumber(),
      reversedAdjustmentId: row.reversedAdjustmentId,
      createdAt: row.createdAt,
    });
  }

  static toPersistence(adjustment: StockAdjustment): Prisma.StockAdjustmentUncheckedCreateInput {
    return {
      id: adjustment.id,
      materialId: adjustment.materialId,
      kind: adjustment.kind,
      quantityDelta: new Prisma.Decimal(adjustment.quantityDelta),
      reason: adjustment.reason,
      observation: adjustment.observation,
      costBasisAmount: toPersistenceDecimal(adjustment.costBasisAmount),
      costBasisQuantity: new Prisma.Decimal(adjustment.costBasisQuantity),
      reversedAdjustmentId: adjustment.reversedAdjustmentId,
      createdAt: adjustment.createdAt,
    };
  }
}
