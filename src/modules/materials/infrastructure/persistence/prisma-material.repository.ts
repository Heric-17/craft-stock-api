import { Inject, Injectable } from '@nestjs/common';

import { PrismaService } from '../../../../shared/infrastructure/prisma/prisma.service';
import type { Prisma } from '../../../../shared/infrastructure/prisma/generated/client';
import type { Material } from '../../domain/material.entity';
import type { MaterialPriceHistory } from '../../domain/material-price-history.entity';
import type { MaterialRepository } from '../../domain/repositories/material.repository';
import { MaterialMapper } from './mappers/material.mapper';
import { MaterialPriceHistoryMapper } from './mappers/material-price-history.mapper';

/**
 * Accepts `Prisma.TransactionClient` rather than the concrete `PrismaService`
 * class so the very same repository code can run against the default
 * connection or against the transactional client `PrismaUnitOfWork` hands it.
 * `@Inject(PrismaService)` still tells Nest which provider to resolve for the
 * non-transactional case; `PrismaService` structurally satisfies
 * `Prisma.TransactionClient`.
 */
@Injectable()
export class PrismaMaterialRepository implements MaterialRepository {
  constructor(@Inject(PrismaService) private readonly prisma: Prisma.TransactionClient) {}

  async findById(id: string): Promise<Material | null> {
    const row = await this.prisma.material.findUnique({ where: { id } });
    return row ? MaterialMapper.toDomain(row) : null;
  }

  async findAll(): Promise<Material[]> {
    const rows = await this.prisma.material.findMany({ orderBy: { name: 'asc' } });
    return rows.map((row) => MaterialMapper.toDomain(row));
  }

  async save(material: Material): Promise<void> {
    const data = MaterialMapper.toPersistence(material);

    await this.prisma.material.upsert({
      where: { id: material.id },
      create: data,
      update: data,
    });
  }

  /**
   * `MaterialPriceHistory` belongs to this Material's own aggregate — deleting
   * a Material must cascade to it explicitly, since the FK is `onDelete:
   * Restrict`, not `Cascade`. Callers must have already checked
   * `countReferences` returns zero: this method does not re-check.
   */
  async delete(id: string): Promise<void> {
    await this.prisma.materialPriceHistory.deleteMany({ where: { materialId: id } });
    await this.prisma.material.delete({ where: { id } });
  }

  async addPriceHistoryEntry(entry: MaterialPriceHistory): Promise<void> {
    await this.prisma.materialPriceHistory.create({
      data: MaterialPriceHistoryMapper.toPersistence(entry),
    });
  }

  async findPriceHistoryByMaterialId(materialId: string): Promise<MaterialPriceHistory[]> {
    const rows = await this.prisma.materialPriceHistory.findMany({
      where: { materialId },
      orderBy: { changedAt: 'asc' },
    });

    return rows.map((row) => MaterialPriceHistoryMapper.toDomain(row));
  }

  async countReferences(materialId: string): Promise<number> {
    const [bomItems, saleItems, purchaseItems, stockMovements] = await Promise.all([
      this.prisma.bomItem.count({ where: { materialId } }),
      this.prisma.saleItem.count({ where: { materialId } }),
      this.prisma.purchaseItem.count({ where: { materialId } }),
      this.prisma.stockMovementSnapshot.count({ where: { materialId } }),
    ]);

    return bomItems + saleItems + purchaseItems + stockMovements;
  }
}
