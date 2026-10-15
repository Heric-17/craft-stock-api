import { Money } from '../../../shared/domain/money/money';
import { businessMonthOf, businessMonthsIn } from '../../../shared/domain/time/business-calendar';
import type {
  StockLossByMaterial,
  StockLossByMonth,
  StockLossByReason,
  StockLossDataset,
  StockLossDatasetQuery,
  StockLossTotals,
} from './ports/stock-loss-dataset.port';
import type { StockLoss } from './stock-loss.entity';
import { STOCK_LOSS_REASONS, type StockLossReason } from './stock-loss-reason.enum';

/** A loss with the name of its Material. */
export interface StockLossFact {
  loss: StockLoss;
  materialName: string;
}

const emptyTotals = (): StockLossTotals => ({ lossCount: 0, lossValue: Money.zero() });

function add(totals: StockLossTotals, loss: StockLoss): StockLossTotals {
  return { lossCount: totals.lossCount + 1, lossValue: totals.lossValue.plus(loss.value) };
}

/**
 * Folds the losses of the period into the dataset. Each loss adds its own
 * rounded value, so a total equals the rows of the list, which a database
 * `SUM` over the decimals would not.
 */
export function buildStockLossDataset(
  query: StockLossDatasetQuery,
  facts: readonly StockLossFact[],
): StockLossDataset {
  const byMonth = new Map<string, StockLossTotals>(
    businessMonthsIn(query.from, query.to).map((month) => [month, emptyTotals()]),
  );
  const byReason = new Map<StockLossReason, StockLossTotals>(
    STOCK_LOSS_REASONS.map((reason) => [reason, emptyTotals()]),
  );
  const byMaterial = new Map<string, StockLossByMaterial>();

  for (const { loss, materialName } of facts) {
    const month = businessMonthOf(loss.createdAt);
    byMonth.set(month, add(byMonth.get(month) ?? emptyTotals(), loss));

    byReason.set(loss.reason, add(byReason.get(loss.reason) as StockLossTotals, loss));

    byMaterial.set(loss.materialId, {
      materialId: loss.materialId,
      materialName,
      ...add(byMaterial.get(loss.materialId) ?? emptyTotals(), loss),
    });
  }

  return {
    from: query.from,
    to: query.to,
    byMonth: [...byMonth.entries()]
      .map(([month, totals]): StockLossByMonth => ({ month, ...totals }))
      .sort((a, b) => a.month.localeCompare(b.month)),
    byReason: STOCK_LOSS_REASONS.map((reason): StockLossByReason => ({
      reason,
      ...(byReason.get(reason) as StockLossTotals),
    })),
    byMaterial: [...byMaterial.values()].sort(
      (a, b) =>
        b.lossValue.toCents() - a.lossValue.toCents() ||
        a.materialName.localeCompare(b.materialName) ||
        a.materialId.localeCompare(b.materialId),
    ),
  };
}
