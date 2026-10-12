import {
  toDomainBasisPoints,
  toPersistencePercentage,
} from '../../../../../shared/infrastructure/persistence/basis-points.mapper';
import {
  toDomainMoney,
  toPersistenceDecimal,
} from '../../../../../shared/infrastructure/persistence/money.mapper';
import type { CompositeProductModel } from '../../../../../shared/infrastructure/prisma/generated/models';
import type { Prisma } from '../../../../../shared/infrastructure/prisma/generated/client';
import { CompositeProduct } from '../../../domain/composite-product.entity';

export class CompositeProductMapper {
  static toDomain(row: CompositeProductModel): CompositeProduct {
    return new CompositeProduct({
      id: row.id,
      name: row.name,
      description: row.description,
      imageKey: row.imageKey,
      fixedOperationalCost: toDomainMoney(row.fixedOperationalCost),
      profitMarginBasisPoints: toDomainBasisPoints(row.profitMargin),
      manualPrice: row.manualPrice ? toDomainMoney(row.manualPrice) : null,
      discontinuedAt: row.discontinuedAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }

  static toPersistence(product: CompositeProduct): Prisma.CompositeProductUncheckedCreateInput {
    return {
      id: product.id,
      name: product.name,
      description: product.description,
      imageKey: product.imageKey,
      fixedOperationalCost: toPersistenceDecimal(product.fixedOperationalCost),
      profitMargin: toPersistencePercentage(product.profitMarginBasisPoints),
      manualPrice: product.manualPrice ? toPersistenceDecimal(product.manualPrice) : null,
      discontinuedAt: product.discontinuedAt,
      createdAt: product.createdAt,
      updatedAt: product.updatedAt,
    };
  }
}
