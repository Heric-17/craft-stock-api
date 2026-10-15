import { Inject, Injectable } from '@nestjs/common';

import type { Prisma } from '../../../../shared/infrastructure/prisma/generated/client';
import { PRISMA_CLIENT } from '../../../../shared/infrastructure/prisma/prisma-client.token';
import type {
  StockLossListQuery,
  StockLossPage,
  StockLossRepository,
} from '../../domain/repositories/stock-loss.repository';
import type { StockLoss } from '../../domain/stock-loss.entity';
import { StockLossMapper } from './mappers/stock-loss.mapper';

@Injectable()
export class PrismaStockLossRepository implements StockLossRepository {
  constructor(@Inject(PRISMA_CLIENT) private readonly prisma: Prisma.TransactionClient) {}

  async save(loss: StockLoss): Promise<void> {
    await this.prisma.stockLoss.create({ data: StockLossMapper.toPersistence(loss) });
  }

  async findPage(query: StockLossListQuery): Promise<StockLossPage> {
    const where: Prisma.StockLossWhereInput = {
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
      this.prisma.stockLoss.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: query.offset,
        take: query.limit,
      }),
      this.prisma.stockLoss.count({ where }),
    ]);

    return {
      losses: rows.map((row) => StockLossMapper.toDomain(row)),
      total,
      limit: query.limit,
      offset: query.offset,
    };
  }
}
