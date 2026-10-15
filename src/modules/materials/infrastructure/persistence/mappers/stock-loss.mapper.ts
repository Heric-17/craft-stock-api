import {
  toDomainMoney,
  toPersistenceDecimal,
} from '../../../../../shared/infrastructure/persistence/money.mapper';
import type { StockLossModel } from '../../../../../shared/infrastructure/prisma/generated/models';
import { Prisma } from '../../../../../shared/infrastructure/prisma/generated/client';
import { StockLoss } from '../../../domain/stock-loss.entity';

export class StockLossMapper {
  static toDomain(row: StockLossModel): StockLoss {
    return new StockLoss({
      id: row.id,
      materialId: row.materialId,
      quantity: row.quantity.toNumber(),
      reason: row.reason,
      observation: row.observation,
      costBasisAmount: toDomainMoney(row.costBasisAmount),
      costBasisQuantity: row.costBasisQuantity.toNumber(),
      createdAt: row.createdAt,
    });
  }

  static toPersistence(loss: StockLoss): Prisma.StockLossUncheckedCreateInput {
    return {
      id: loss.id,
      materialId: loss.materialId,
      quantity: new Prisma.Decimal(loss.quantity),
      reason: loss.reason,
      observation: loss.observation,
      costBasisAmount: toPersistenceDecimal(loss.costBasisAmount),
      costBasisQuantity: new Prisma.Decimal(loss.costBasisQuantity),
      createdAt: loss.createdAt,
    };
  }
}
