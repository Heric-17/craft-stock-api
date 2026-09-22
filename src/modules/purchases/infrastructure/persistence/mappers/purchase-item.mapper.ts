import {
  toDomainMoney,
  toPersistenceDecimal,
} from '../../../../../shared/infrastructure/persistence/money.mapper';
import type { PurchaseItemModel } from '../../../../../shared/infrastructure/prisma/generated/models';
import { Prisma } from '../../../../../shared/infrastructure/prisma/generated/client';
import { PurchaseItem } from '../../../domain/purchase-item.entity';

export class PurchaseItemMapper {
  static toDomain(row: PurchaseItemModel): PurchaseItem {
    return new PurchaseItem({
      id: row.id,
      purchaseId: row.purchaseId,
      code: row.code,
      description: row.description,
      quantity: row.quantity.toNumber(),
      unit: row.unit,
      unitPrice: toDomainMoney(row.unitPrice),
      grossValue: toDomainMoney(row.grossValue),
      allocatedDiscount: toDomainMoney(row.allocatedDiscount),
      isCompanyExpense: row.isCompanyExpense,
      isStockMaterial: row.isStockMaterial,
      materialId: row.materialId,
    });
  }

  static toPersistence(item: PurchaseItem): Prisma.PurchaseItemUncheckedCreateInput {
    return {
      id: item.id,
      purchaseId: item.purchaseId,
      code: item.code,
      description: item.description,
      quantity: new Prisma.Decimal(item.quantity),
      unit: item.unit,
      unitPrice: toPersistenceDecimal(item.unitPrice),
      grossValue: toPersistenceDecimal(item.grossValue),
      allocatedDiscount: toPersistenceDecimal(item.allocatedDiscount),
      isCompanyExpense: item.isCompanyExpense,
      isStockMaterial: item.isStockMaterial,
      materialId: item.materialId,
    };
  }
}
