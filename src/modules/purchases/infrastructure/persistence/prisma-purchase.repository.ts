import { Inject, Injectable } from '@nestjs/common';

import { PrismaService } from '../../../../shared/infrastructure/prisma/prisma.service';
import type { Prisma } from '../../../../shared/infrastructure/prisma/generated/client';
import type { Purchase } from '../../domain/purchase.entity';
import type { PurchaseItem } from '../../domain/purchase-item.entity';
import type { PurchaseRepository } from '../../domain/repositories/purchase.repository';
import { PurchaseMapper } from './mappers/purchase.mapper';
import { PurchaseItemMapper } from './mappers/purchase-item.mapper';

@Injectable()
export class PrismaPurchaseRepository implements PurchaseRepository {
  constructor(@Inject(PrismaService) private readonly prisma: Prisma.TransactionClient) {}

  async findById(id: string): Promise<Purchase | null> {
    const row = await this.prisma.purchase.findUnique({ where: { id } });
    return row ? PurchaseMapper.toDomain(row) : null;
  }

  async findByAccessKey(accessKey: string): Promise<Purchase | null> {
    const row = await this.prisma.purchase.findUnique({ where: { accessKey } });
    return row ? PurchaseMapper.toDomain(row) : null;
  }

  async findAll(): Promise<Purchase[]> {
    const rows = await this.prisma.purchase.findMany({ orderBy: { purchaseDate: 'desc' } });
    return rows.map((row) => PurchaseMapper.toDomain(row));
  }

  async save(purchase: Purchase): Promise<void> {
    const data = PurchaseMapper.toPersistence(purchase);

    await this.prisma.purchase.upsert({
      where: { id: purchase.id },
      create: data,
      update: data,
    });
  }

  async delete(id: string): Promise<void> {
    await this.prisma.purchase.delete({ where: { id } });
  }

  async findItemsByPurchaseId(purchaseId: string): Promise<PurchaseItem[]> {
    const rows = await this.prisma.purchaseItem.findMany({ where: { purchaseId } });
    return rows.map((row) => PurchaseItemMapper.toDomain(row));
  }

  async saveItems(items: PurchaseItem[]): Promise<void> {
    await Promise.all(
      items.map((item) => {
        const data = PurchaseItemMapper.toPersistence(item);
        return this.prisma.purchaseItem.upsert({
          where: { id: item.id },
          create: data,
          update: data,
        });
      }),
    );
  }
}
