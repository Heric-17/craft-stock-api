import { Inject, Injectable } from '@nestjs/common';

import type { Prisma } from '../../../../shared/infrastructure/prisma/generated/client';
import { PRISMA_CLIENT } from '../../../../shared/infrastructure/prisma/prisma-client.token';
import type {
  StockLossDataset,
  StockLossDatasetPort,
  StockLossDatasetQuery,
} from '../../domain/ports/stock-loss-dataset.port';
import { buildStockLossDataset } from '../../domain/stock-loss-dataset';
import { StockLossMapper } from '../persistence/mappers/stock-loss.mapper';

@Injectable()
export class PrismaStockLossDatasetAdapter implements StockLossDatasetPort {
  constructor(@Inject(PRISMA_CLIENT) private readonly prisma: Prisma.TransactionClient) {}

  /**
   * The database only filters by period and returns the rows; the sum is done
   * in the domain. A `SUM` over the decimals would round once at the end and
   * disagree with the list, which rounds per loss. Losses are rare and the
   * period bounds the read.
   */
  async lossDataset(query: StockLossDatasetQuery): Promise<StockLossDataset> {
    const rows = await this.prisma.stockLoss.findMany({
      where: { createdAt: { gte: query.from, lt: query.to } },
      include: { material: { select: { name: true } } },
    });

    return buildStockLossDataset(
      query,
      rows.map((row) => ({
        loss: StockLossMapper.toDomain(row),
        materialName: row.material.name,
      })),
    );
  }
}
