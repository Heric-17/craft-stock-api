import { Inject, Injectable } from '@nestjs/common';

import { PrismaService } from '../../../../shared/infrastructure/prisma/prisma.service';
import type { Prisma } from '../../../../shared/infrastructure/prisma/generated/client';
import type { Purchase } from '../../domain/purchase.entity';
import type { PurchaseRepository } from '../../domain/repositories/purchase.repository';
import { PurchaseMapper } from './mappers/purchase.mapper';
import { PurchaseItemMapper } from './mappers/purchase-item.mapper';

@Injectable()
export class PrismaPurchaseRepository implements PurchaseRepository {
  constructor(@Inject(PrismaService) private readonly prisma: Prisma.TransactionClient) {}

  async findById(id: string): Promise<Purchase | null> {
    const row = await this.prisma.purchase.findUnique({ where: { id }, include: { items: true } });
    return row ? PurchaseMapper.toDomain(row) : null;
  }

  async findByAccessKey(accessKey: string): Promise<Purchase | null> {
    const row = await this.prisma.purchase.findUnique({
      where: { accessKey },
      include: { items: true },
    });
    return row ? PurchaseMapper.toDomain(row) : null;
  }

  async findAll(): Promise<Purchase[]> {
    const rows = await this.prisma.purchase.findMany({
      orderBy: { purchaseDate: 'desc' },
      include: { items: true },
    });
    return rows.map((row) => PurchaseMapper.toDomain(row));
  }

  /**
   * Writes the root and its lines together, and drops any line that is no
   * longer part of the aggregate. Saving the whole thing is what makes it
   * impossible to persist a reclassified line without the reattributed
   * discount that came with it.
   */
  async save(purchase: Purchase): Promise<void> {
    const data = PurchaseMapper.toPersistence(purchase);

    await this.prisma.purchase.upsert({
      where: { id: purchase.id },
      create: data,
      update: data,
    });

    const keptIds = purchase.items.map((item) => item.id);

    await this.prisma.purchaseItem.deleteMany({
      where: { purchaseId: purchase.id, id: { notIn: keptIds } },
    });

    for (const item of purchase.items) {
      const itemData = PurchaseItemMapper.toPersistence(item);

      await this.prisma.purchaseItem.upsert({
        where: { id: item.id },
        create: itemData,
        update: itemData,
      });
    }
  }

  async delete(id: string): Promise<void> {
    await this.prisma.purchaseItem.deleteMany({ where: { purchaseId: id } });
    await this.prisma.purchase.delete({ where: { id } });
  }
}
