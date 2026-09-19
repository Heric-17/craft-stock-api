import type { StockMovementSnapshotModel } from '../../../../../shared/infrastructure/prisma/generated/models';
import { Prisma } from '../../../../../shared/infrastructure/prisma/generated/client';
import { StockMovementSnapshot } from '../../../domain/stock-movement-snapshot.entity';

export class StockMovementSnapshotMapper {
  static toDomain(row: StockMovementSnapshotModel): StockMovementSnapshot {
    return new StockMovementSnapshot({
      id: row.id,
      saleId: row.saleId,
      materialId: row.materialId,
      quantityDebited: row.quantityDebited.toNumber(),
      createdAt: row.createdAt,
    });
  }

  static toPersistence(
    snapshot: StockMovementSnapshot,
  ): Prisma.StockMovementSnapshotUncheckedCreateInput {
    return {
      id: snapshot.id,
      saleId: snapshot.saleId,
      materialId: snapshot.materialId,
      quantityDebited: new Prisma.Decimal(snapshot.quantityDebited),
      createdAt: snapshot.createdAt,
    };
  }
}
