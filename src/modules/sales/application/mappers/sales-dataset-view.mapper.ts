import type { SalesDataset, SalesTotals } from '../../domain/ports/sales-analytics.port';
import type { SalesDatasetView, SalesTotalsView } from '../dto/sales.dto';

export class SalesDatasetViewMapper {
  static toView(dataset: SalesDataset): SalesDatasetView {
    return {
      from: dataset.from,
      to: dataset.to,
      byMonth: dataset.byMonth.map((cell) => ({
        month: cell.month,
        ...SalesDatasetViewMapper.totals(cell),
      })),
      byPaymentStatus: dataset.byPaymentStatus.map((cell) => ({
        paymentStatus: cell.paymentStatus,
        ...SalesDatasetViewMapper.totals(cell),
      })),
      byProductionStatus: dataset.byProductionStatus.map((cell) => ({
        productionStatus: cell.productionStatus,
        ...SalesDatasetViewMapper.totals(cell),
      })),
      openItems: dataset.openItems.map((cell) => ({
        paymentStatus: cell.paymentStatus,
        productionStatus: cell.productionStatus,
        ...SalesDatasetViewMapper.totals(cell),
      })),
    };
  }

  private static totals(cell: SalesTotals): SalesTotalsView {
    return { saleCount: cell.saleCount, totalAmount: cell.totalAmount.toDecimalString() };
  }
}
