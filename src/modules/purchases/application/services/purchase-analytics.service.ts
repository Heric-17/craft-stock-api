import { Inject, Injectable } from '@nestjs/common';

import {
  PURCHASE_ANALYTICS_PORT,
  type PurchaseAnalyticsPort,
} from '../../domain/ports/purchase-analytics.port';
import type { SpendingDatasetView, SpendingQueryInput } from '../dto/purchases.dto';
import { PurchaseViewMapper } from '../mappers/purchase-view.mapper';

/**
 * Reading side of the spending panel. Hands the client the dataset by
 * dimension and stops there: the month's total, the average ticket, the
 * ranking of shops and the comparison against the previous month are derived
 * from these buckets, client-side, so a new question on the panel does not
 * travel back through port, adapter and fake.
 *
 * This service has one method for the same reason the port does. A second
 * one would be the start of a method per screen.
 */
@Injectable()
export class PurchaseAnalyticsService {
  constructor(@Inject(PURCHASE_ANALYTICS_PORT) private readonly analytics: PurchaseAnalyticsPort) {}

  async getSpending(query: SpendingQueryInput): Promise<SpendingDatasetView> {
    const dataset = await this.analytics.spendingDataset({
      from: query.from,
      to: query.to,
      granularity: query.granularity,
      ...(query.establishmentId !== undefined ? { establishmentId: query.establishmentId } : {}),
    });

    return PurchaseViewMapper.toSpendingView(dataset);
  }
}
