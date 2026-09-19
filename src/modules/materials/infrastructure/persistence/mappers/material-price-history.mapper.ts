import {
  toDomainMoney,
  toPersistenceDecimal,
} from '../../../../../shared/infrastructure/persistence/money.mapper';
import type { MaterialPriceHistoryModel } from '../../../../../shared/infrastructure/prisma/generated/models';
import type { Prisma } from '../../../../../shared/infrastructure/prisma/generated/client';
import { MaterialPriceHistory } from '../../../domain/material-price-history.entity';

export class MaterialPriceHistoryMapper {
  static toDomain(row: MaterialPriceHistoryModel): MaterialPriceHistory {
    return new MaterialPriceHistory({
      id: row.id,
      materialId: row.materialId,
      previousValue: toDomainMoney(row.previousValue),
      newValue: toDomainMoney(row.newValue),
      origin: row.origin,
      changedAt: row.changedAt,
    });
  }

  static toPersistence(
    entry: MaterialPriceHistory,
  ): Prisma.MaterialPriceHistoryUncheckedCreateInput {
    return {
      id: entry.id,
      materialId: entry.materialId,
      previousValue: toPersistenceDecimal(entry.previousValue),
      newValue: toPersistenceDecimal(entry.newValue),
      origin: entry.origin,
      changedAt: entry.changedAt,
    };
  }
}
