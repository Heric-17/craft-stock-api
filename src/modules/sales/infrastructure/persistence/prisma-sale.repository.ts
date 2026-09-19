import { Inject, Injectable } from '@nestjs/common';

import { PrismaService } from '../../../../shared/infrastructure/prisma/prisma.service';
import type { Prisma } from '../../../../shared/infrastructure/prisma/generated/client';
import type { Sale } from '../../domain/sale.entity';
import type { SaleItem } from '../../domain/sale-item.entity';
import type { StockMovementSnapshot } from '../../domain/stock-movement-snapshot.entity';
import type { SaleRepository } from '../../domain/repositories/sale.repository';
import { SaleMapper } from './mappers/sale.mapper';
import { SaleItemMapper } from './mappers/sale-item.mapper';
import { StockMovementSnapshotMapper } from './mappers/stock-movement-snapshot.mapper';

@Injectable()
export class PrismaSaleRepository implements SaleRepository {
  constructor(@Inject(PrismaService) private readonly prisma: Prisma.TransactionClient) {}

  async findById(id: string): Promise<Sale | null> {
    const row = await this.prisma.sale.findUnique({ where: { id } });
    return row ? SaleMapper.toDomain(row) : null;
  }

  async findAll(): Promise<Sale[]> {
    const rows = await this.prisma.sale.findMany({ orderBy: { createdAt: 'desc' } });
    return rows.map((row) => SaleMapper.toDomain(row));
  }

  async save(sale: Sale): Promise<void> {
    const data = SaleMapper.toPersistence(sale);

    await this.prisma.sale.upsert({
      where: { id: sale.id },
      create: data,
      update: data,
    });
  }

  async delete(id: string): Promise<void> {
    await this.prisma.sale.delete({ where: { id } });
  }

  async findItemsBySaleId(saleId: string): Promise<SaleItem[]> {
    const rows = await this.prisma.saleItem.findMany({ where: { saleId } });
    return rows.map((row) => SaleItemMapper.toDomain(row));
  }

  async saveItems(items: SaleItem[]): Promise<void> {
    await Promise.all(
      items.map((item) => {
        const data = SaleItemMapper.toPersistence(item);
        return this.prisma.saleItem.upsert({ where: { id: item.id }, create: data, update: data });
      }),
    );
  }

  async deleteItem(id: string): Promise<void> {
    await this.prisma.saleItem.delete({ where: { id } });
  }

  async findStockMovementsBySaleId(saleId: string): Promise<StockMovementSnapshot[]> {
    const rows = await this.prisma.stockMovementSnapshot.findMany({ where: { saleId } });
    return rows.map((row) => StockMovementSnapshotMapper.toDomain(row));
  }

  async saveStockMovements(snapshots: StockMovementSnapshot[]): Promise<void> {
    await Promise.all(
      snapshots.map((snapshot) => {
        const data = StockMovementSnapshotMapper.toPersistence(snapshot);
        return this.prisma.stockMovementSnapshot.upsert({
          where: { id: snapshot.id },
          create: data,
          update: data,
        });
      }),
    );
  }

  async deleteStockMovementsBySaleId(saleId: string): Promise<void> {
    await this.prisma.stockMovementSnapshot.deleteMany({ where: { saleId } });
  }
}
