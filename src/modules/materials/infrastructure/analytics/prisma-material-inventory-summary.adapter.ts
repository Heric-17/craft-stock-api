import { Inject, Injectable } from '@nestjs/common';

import type { Prisma } from '../../../../shared/infrastructure/prisma/generated/client';
import { PRISMA_CLIENT } from '../../../../shared/infrastructure/prisma/prisma-client.token';
import { summarizeInventory } from '../../domain/inventory-summary';
import type {
  InventorySummary,
  InventorySummaryQuery,
  MaterialInventorySummaryPort,
} from '../../domain/ports/material-inventory-summary.port';
import { MaterialMapper } from '../persistence/mappers/material.mapper';

@Injectable()
export class PrismaMaterialInventorySummaryAdapter implements MaterialInventorySummaryPort {
  constructor(@Inject(PRISMA_CLIENT) private readonly prisma: Prisma.TransactionClient) {}

  /**
   * Reads the Materials and sums their values in the domain. It does not ask
   * the database to multiply and add: a `SUM(stockQuantity * packageCost /
   * packageQuantity)` rounds once at the end, while the rule is to round each
   * Material's value before adding (see `summarizeInventory`).
   */
  async summary(query: InventorySummaryQuery = {}): Promise<InventorySummary> {
    const rows = await this.prisma.material.findMany({
      where: query.includeDiscontinued === true ? {} : { discontinuedAt: null },
    });

    return summarizeInventory(rows.map((row) => MaterialMapper.toDomain(row)));
  }
}
