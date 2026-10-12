import type {
  SalesAnalyticsPort,
  SalesDataset,
  SalesDatasetQuery,
} from '../../domain/ports/sales-analytics.port';
import { saleTotal } from '../../domain/sale-line-total';
import { buildSalesDataset, isOpenSale, type SaleSummary } from '../../domain/sales-dataset';
import type { InMemorySaleRepository } from '../persistence/in-memory-sale.repository';

/**
 * In-memory `SalesAnalyticsPort` for `application/` tests. Reads whatever the
 * in-memory repository holds, so a test writes sales through the repository and
 * reads the dataset through the port, exactly as the Prisma pair does. Both
 * hand their rows to the same `buildSalesDataset`, so the dataset's shape and
 * arithmetic are not reimplemented here. Never mocks Prisma.
 */
export class InMemorySalesAnalyticsAdapter implements SalesAnalyticsPort {
  constructor(private readonly sales: InMemorySaleRepository) {}

  async salesDataset(query: SalesDatasetQuery): Promise<SalesDataset> {
    const summaries: SaleSummary[] = [];

    for (const sale of this.sales.all()) {
      const items = await this.sales.findItemsBySaleId(sale.id);

      summaries.push({
        createdAt: sale.createdAt,
        paymentStatus: sale.paymentStatus,
        productionStatus: sale.productionStatus,
        totalAmount: saleTotal(items),
      });
    }

    return buildSalesDataset(
      query,
      summaries.filter((sale) => sale.createdAt >= query.from && sale.createdAt < query.to),
      summaries.filter(isOpenSale),
    );
  }
}
