import { Inject, Injectable } from '@nestjs/common';

import { PRISMA_CLIENT } from '../../../../shared/infrastructure/prisma/prisma-client.token';
import type { Prisma } from '../../../../shared/infrastructure/prisma/generated/client';
import type { BillOfMaterials } from '../../domain/bill-of-materials.entity';
import type { CompositeProduct } from '../../domain/composite-product.entity';
import type { CompositeProductRepository } from '../../domain/repositories/composite-product.repository';
import { BillOfMaterialsMapper } from './mappers/bill-of-materials.mapper';
import { BomItemMapper } from './mappers/bom-item.mapper';
import { CompositeProductMapper } from './mappers/composite-product.mapper';

@Injectable()
export class PrismaCompositeProductRepository implements CompositeProductRepository {
  constructor(@Inject(PRISMA_CLIENT) private readonly prisma: Prisma.TransactionClient) {}

  async findById(id: string): Promise<CompositeProduct | null> {
    const row = await this.prisma.compositeProduct.findUnique({ where: { id } });
    return row ? CompositeProductMapper.toDomain(row) : null;
  }

  async findAll(): Promise<CompositeProduct[]> {
    const rows = await this.prisma.compositeProduct.findMany({ orderBy: { name: 'asc' } });
    return rows.map((row) => CompositeProductMapper.toDomain(row));
  }

  async save(product: CompositeProduct): Promise<void> {
    const data = CompositeProductMapper.toPersistence(product);

    await this.prisma.compositeProduct.upsert({
      where: { id: product.id },
      create: data,
      update: data,
    });
  }

  async delete(id: string): Promise<void> {
    await this.prisma.bomItem.deleteMany({
      where: { billOfMaterials: { compositeProductId: id } },
    });
    await this.prisma.billOfMaterials.deleteMany({ where: { compositeProductId: id } });
    await this.prisma.compositeProduct.delete({ where: { id } });
  }

  async findBillOfMaterials(compositeProductId: string): Promise<BillOfMaterials | null> {
    const row = await this.prisma.billOfMaterials.findUnique({
      where: { compositeProductId },
      include: { items: true },
    });

    return row ? BillOfMaterialsMapper.toDomain(row) : null;
  }

  async saveBillOfMaterials(billOfMaterials: BillOfMaterials): Promise<void> {
    await this.prisma.billOfMaterials.upsert({
      where: { compositeProductId: billOfMaterials.compositeProductId },
      create: { id: billOfMaterials.id, compositeProductId: billOfMaterials.compositeProductId },
      update: {},
    });

    await this.prisma.bomItem.deleteMany({ where: { billOfMaterialsId: billOfMaterials.id } });

    if (billOfMaterials.items.length > 0) {
      await this.prisma.bomItem.createMany({
        data: billOfMaterials.items.map((item) => BomItemMapper.toPersistence(item)),
      });
    }
  }

  async countReferences(compositeProductId: string): Promise<number> {
    return this.prisma.saleItem.count({ where: { compositeProductId } });
  }
}
