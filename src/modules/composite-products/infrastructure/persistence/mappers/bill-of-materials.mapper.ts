import type {
  BillOfMaterialsModel,
  BomItemModel,
} from '../../../../../shared/infrastructure/prisma/generated/models';
import { BillOfMaterials } from '../../../domain/bill-of-materials.entity';
import { BomItemMapper } from './bom-item.mapper';

export class BillOfMaterialsMapper {
  static toDomain(row: BillOfMaterialsModel & { items: BomItemModel[] }): BillOfMaterials {
    return new BillOfMaterials({
      id: row.id,
      compositeProductId: row.compositeProductId,
      items: row.items.map((item) => BomItemMapper.toDomain(item)),
    });
  }
}
