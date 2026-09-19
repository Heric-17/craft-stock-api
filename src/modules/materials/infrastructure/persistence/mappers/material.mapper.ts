import {
  toDomainMoney,
  toPersistenceDecimal,
} from '../../../../../shared/infrastructure/persistence/money.mapper';
import type { MaterialModel } from '../../../../../shared/infrastructure/prisma/generated/models';
import { Prisma } from '../../../../../shared/infrastructure/prisma/generated/client';
import { Material } from '../../../domain/material.entity';

export class MaterialMapper {
  static toDomain(row: MaterialModel): Material {
    return new Material({
      id: row.id,
      name: row.name,
      description: row.description,
      imageUrl: row.imageUrl,
      packageCost: toDomainMoney(row.packageCost),
      packageQuantity: row.packageQuantity.toNumber(),
      stockQuantity: row.stockQuantity.toNumber(),
      minimumStockAlert: row.minimumStockAlert.toNumber(),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }

  static toPersistence(material: Material): Prisma.MaterialUncheckedCreateInput {
    return {
      id: material.id,
      name: material.name,
      description: material.description,
      imageUrl: material.imageUrl,
      packageCost: toPersistenceDecimal(material.packageCost),
      packageQuantity: new Prisma.Decimal(material.packageQuantity),
      stockQuantity: new Prisma.Decimal(material.stockQuantity),
      minimumStockAlert: new Prisma.Decimal(material.minimumStockAlert),
      createdAt: material.createdAt,
      updatedAt: material.updatedAt,
    };
  }
}
