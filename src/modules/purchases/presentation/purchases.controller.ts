import { Controller, Get, Query } from '@nestjs/common';

import type { SpendingByPeriodView } from '../application/dto/purchases.dto';
import { PurchaseAnalyticsService } from '../application/services/purchase-analytics.service';
import { SpendingQueryDto } from './dto/spending-query.dto';

@Controller('purchases')
export class PurchasesController {
  constructor(private readonly purchaseAnalytics: PurchaseAnalyticsService) {}

  /**
   * The spending dataset, bucketed by period. Deliberately a dataset and not
   * a set of finished figures: the panel derives what it shows from it.
   */
  @Get('spending')
  getSpending(@Query() query: SpendingQueryDto): Promise<SpendingByPeriodView[]> {
    return this.purchaseAnalytics.getSpending({
      from: new Date(query.from),
      to: new Date(query.to),
      granularity: query.granularity,
    });
  }
}
