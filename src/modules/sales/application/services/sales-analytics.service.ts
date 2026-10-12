import { Inject, Injectable } from '@nestjs/common';

import {
  SALES_ANALYTICS_PORT,
  type SalesAnalyticsPort,
} from '../../domain/ports/sales-analytics.port';
import type { SalesDatasetQueryInput, SalesDatasetView } from '../dto/sales.dto';
import { SalesDatasetViewMapper } from '../mappers/sales-dataset-view.mapper';

/**
 * Reading side of the sales panel. Hands the client the dataset by dimension
 * and stops there: sales this month, the change against the previous month,
 * orders in production and the amount to receive are derived from these cells,
 * client-side. One method, for the same reason the port has one.
 */
@Injectable()
export class SalesAnalyticsService {
  constructor(@Inject(SALES_ANALYTICS_PORT) private readonly analytics: SalesAnalyticsPort) {}

  async getSalesDataset(query: SalesDatasetQueryInput): Promise<SalesDatasetView> {
    return SalesDatasetViewMapper.toView(
      await this.analytics.salesDataset({ from: query.from, to: query.to }),
    );
  }
}
