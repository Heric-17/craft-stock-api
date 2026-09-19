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
      description: row.description,
      quantity: row.quantity.toNumber(),
      unitPrice: toDomainMoney(row.unitPrice),
      isCompanyExpense: row.isCompanyExpense,
      isStockMaterial: row.isStockMaterial,
      materialId: row.materialId,
    });
  }

  static toPersistence(item: PurchaseItem): Prisma.PurchaseItemUncheckedCreateInput {
    return {
      id: item.id,
      purchaseId: item.purchaseId,
      description: item.description,
      quantity: new Prisma.Decimal(item.quantity),
      unitPrice: toPersistenceDecimal(item.unitPrice),
      isCompanyExpense: item.isCompanyExpense,
      isStockMaterial: item.isStockMaterial,
      materialId: item.materialId,
    };
  }
}
