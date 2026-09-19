import {
  toDomainMoney,
  toPersistenceDecimal,
} from '../../../../../shared/infrastructure/persistence/money.mapper';
import type { CompositeProductModel } from '../../../../../shared/infrastructure/prisma/generated/models';
import { Prisma } from '../../../../../shared/infrastructure/prisma/generated/client';
import { CompositeProduct } from '../../../domain/composite-product.entity';

export class CompositeProductMapper {
  static toDomain(row: CompositeProductModel): CompositeProduct {
    return new CompositeProduct({
      id: row.id,
      name: row.name,
      description: row.description,
      imageUrl: row.imageUrl,
      fixedOperationalCost: toDomainMoney(row.fixedOperationalCost),
      profitMargin: row.profitMargin.toNumber(),
      manualPrice: row.manualPrice ? toDomainMoney(row.manualPrice) : null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }

  static toPersistence(product: CompositeProduct): Prisma.CompositeProductUncheckedCreateInput {
    return {
      id: product.id,
      name: product.name,
      description: product.description,
      imageUrl: product.imageUrl,
      fixedOperationalCost: toPersistenceDecimal(product.fixedOperationalCost),
      profitMargin: new Prisma.Decimal(product.profitMargin),
      manualPrice: product.manualPrice ? toPersistenceDecimal(product.manualPrice) : null,
      createdAt: product.createdAt,
      updatedAt: product.updatedAt,
    };
  }
}
