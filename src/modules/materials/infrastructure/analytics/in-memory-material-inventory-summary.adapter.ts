import { summarizeInventory } from '../../domain/inventory-summary';
import type {
  InventorySummary,
  InventorySummaryQuery,
  MaterialInventorySummaryPort,
} from '../../domain/ports/material-inventory-summary.port';
import type { InMemoryMaterialRepository } from '../persistence/in-memory-material.repository';

/**
 * In-memory `MaterialInventorySummaryPort` for `application/` tests. Reads the
 * in-memory repository and folds with the same `summarizeInventory` as the
 * Prisma adapter. Never mocks Prisma.
 */
export class InMemoryMaterialInventorySummaryAdapter implements MaterialInventorySummaryPort {
  constructor(private readonly materials: InMemoryMaterialRepository) {}

  async summary(query: InventorySummaryQuery = {}): Promise<InventorySummary> {
    const materials = await this.materials.findAll();

    return summarizeInventory(
      query.includeDiscontinued === true
        ? materials
        : materials.filter((material) => material.isActive),
    );
  }
}
