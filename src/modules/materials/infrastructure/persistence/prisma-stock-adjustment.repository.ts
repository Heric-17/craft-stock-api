import { Inject, Injectable } from '@nestjs/common';

import type { Prisma } from '../../../../shared/infrastructure/prisma/generated/client';
import { PRISMA_CLIENT } from '../../../../shared/infrastructure/prisma/prisma-client.token';
import type {
  StockAdjustmentHistoryPage,
  StockAdjustmentHistoryQuery,
  StockAdjustmentRepository,
  StockLossListQuery,
  StockLossPage,
} from '../../domain/repositories/stock-adjustment.repository';
import type { StockAdjustment } from '../../domain/stock-adjustment.entity';
import { StockAdjustmentMapper } from './mappers/stock-adjustment.mapper';

@Injectable()
export class PrismaStockAdjustmentRepository implements StockAdjustmentRepository {
  constructor(@Inject(PRISMA_CLIENT) private readonly prisma: Prisma.TransactionClient) {}

  async findById(id: string): Promise<StockAdjustment | null> {
    const row = await this.prisma.stockAdjustment.findUnique({ where: { id } });

    return row ? StockAdjustmentMapper.toDomain(row) : null;
  }

  async findReversalOf(adjustmentId: string): Promise<StockAdjustment | null> {
    const row = await this.prisma.stockAdjustment.findUnique({
      where: { reversedAdjustmentId: adjustmentId },
    });

    return row ? StockAdjustmentMapper.toDomain(row) : null;
  }

  async save(adjustment: StockAdjustment): Promise<void> {
    await this.prisma.stockAdjustment.create({
      data: StockAdjustmentMapper.toPersistence(adjustment),
    });
  }

  async findHistoryPage(query: StockAdjustmentHistoryQuery): Promise<StockAdjustmentHistoryPage> {
    const where: Prisma.StockAdjustmentWhereInput = {
      materialId: query.materialId,
      ...(query.kind !== undefined ? { kind: query.kind } : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.stockAdjustment.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: query.offset,
        take: query.limit,
        include: { reversal: { select: { id: true } } },
      }),
      this.prisma.stockAdjustment.count({ where }),
    ]);

    return {
      entries: rows.map((row) => ({
        adjustment: StockAdjustmentMapper.toDomain(row),
        reversedByAdjustmentId: row.reversal?.id ?? null,
      })),
      total,
      limit: query.limit,
      offset: query.offset,
    };
  }

  async findLossPage(query: StockLossListQuery): Promise<StockLossPage> {
    const where: Prisma.StockAdjustmentWhereInput = {
      kind: 'MANUAL_LOSS',
      ...(query.from !== undefined || query.to !== undefined
        ? {
            createdAt: {
              ...(query.from !== undefined ? { gte: query.from } : {}),
              ...(query.to !== undefined ? { lt: query.to } : {}),
            },
          }
        : {}),
      ...(query.materialId !== undefined ? { materialId: query.materialId } : {}),
      ...(query.reason !== undefined ? { reason: query.reason } : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.stockAdjustment.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: query.offset,
        take: query.limit,
        include: { reversal: { select: { id: true } } },
      }),
      this.prisma.stockAdjustment.count({ where }),
    ]);

    return {
      entries: rows.map((row) => ({
        loss: StockAdjustmentMapper.toDomain(row),
        reversedByAdjustmentId: row.reversal?.id ?? null,
      })),
      total,
      limit: query.limit,
      offset: query.offset,
    };
  }
}
