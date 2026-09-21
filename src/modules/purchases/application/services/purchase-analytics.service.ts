import { Inject, Injectable } from '@nestjs/common';

import {
  PURCHASE_ANALYTICS_PORT,
  type PurchaseAnalyticsPort,
} from '../../domain/ports/purchase-analytics.port';
import type { SpendingByPeriodView, SpendingQueryInput } from '../dto/purchases.dto';
import { PurchaseViewMapper } from '../mappers/purchase-view.mapper';

/**
 * Reading side of the spending panel. Hands the client the dataset by period
 * and stops there: the month's total, the comparison against the previous
 * month and any other figure the screen shows are derived from these buckets,
 * client-side, so a new question on the panel does not travel back through
 * port, adapter and fake.
 */
@Injectable()
export class PurchaseAnalyticsService {
  constructor(@Inject(PURCHASE_ANALYTICS_PORT) private readonly analytics: PurchaseAnalyticsPort) {}

  async getSpending(query: SpendingQueryInput): Promise<SpendingByPeriodView[]> {
    const dataset = await this.analytics.spendingByPeriod(query);

    return dataset.map((entry) => PurchaseViewMapper.toSpendingView(entry));
  }
}
