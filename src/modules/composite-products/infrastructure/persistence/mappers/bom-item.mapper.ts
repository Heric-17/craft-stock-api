import type { BomItemModel } from '../../../../../shared/infrastructure/prisma/generated/models';
import { Prisma } from '../../../../../shared/infrastructure/prisma/generated/client';
import { BomItem } from '../../../domain/bom-item.entity';

export class BomItemMapper {
  static toDomain(row: BomItemModel): BomItem {
    return new BomItem({
      id: row.id,
      billOfMaterialsId: row.billOfMaterialsId,
      materialId: row.materialId,
      quantity: row.quantity.toNumber(),
    });
  }

  static toPersistence(item: BomItem): Prisma.BomItemUncheckedCreateInput {
    return {
      id: item.id,
      billOfMaterialsId: item.billOfMaterialsId,
      materialId: item.materialId,
      quantity: new Prisma.Decimal(item.quantity),
    };
  }
}
