import {
  toDomainMoney,
  toPersistenceDecimal,
} from '../../../../../shared/infrastructure/persistence/money.mapper';
import type { SaleItemModel } from '../../../../../shared/infrastructure/prisma/generated/models';
import { Prisma } from '../../../../../shared/infrastructure/prisma/generated/client';
import { SaleItem } from '../../../domain/sale-item.entity';

export class SaleItemMapper {
  static toDomain(row: SaleItemModel): SaleItem {
    return new SaleItem({
      id: row.id,
      saleId: row.saleId,
      compositeProductId: row.compositeProductId,
      materialId: row.materialId,
      quantity: row.quantity.toNumber(),
      itemNameSnapshot: row.itemNameSnapshot,
      unitPriceSnapshot: toDomainMoney(row.unitPriceSnapshot),
    });
  }

  static toPersistence(item: SaleItem): Prisma.SaleItemUncheckedCreateInput {
    return {
      id: item.id,
      saleId: item.saleId,
      compositeProductId: item.compositeProductId,
      materialId: item.materialId,
      quantity: new Prisma.Decimal(item.quantity),
      itemNameSnapshot: item.itemNameSnapshot,
      unitPriceSnapshot: toPersistenceDecimal(item.unitPriceSnapshot),
    };
  }
}
