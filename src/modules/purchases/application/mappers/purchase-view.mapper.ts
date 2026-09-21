import type { SpendingByPeriod } from '../../domain/ports/purchase-analytics.port';
import type { Purchase } from '../../domain/purchase.entity';
import type { PurchaseItem } from '../../domain/purchase-item.entity';
import type { PurchaseItemView, PurchaseView, SpendingByPeriodView } from '../dto/purchases.dto';

export class PurchaseViewMapper {
  static toView(purchase: Purchase, items: readonly PurchaseItem[]): PurchaseView {
    return {
      id: purchase.id,
      purchaseDate: purchase.purchaseDate,
      accessKey: purchase.accessKey,
      grossTotal: purchase.grossTotal.toDecimalString(),
      discountTotal: purchase.discountTotal.toDecimalString(),
      netTotal: purchase.netTotal.toDecimalString(),
      createdAt: purchase.createdAt,
      items: items.map((item) => PurchaseViewMapper.toItemView(item)),
    };
  }

  static toItemView(item: PurchaseItem): PurchaseItemView {
    return {
      id: item.id,
      materialId: item.materialId,
      description: item.description,
      quantity: item.quantity,
      unitPrice: item.unitPrice.toDecimalString(),
      grossValue: item.grossValue.toDecimalString(),
      netValue: item.netValue.toDecimalString(),
      isCompanyExpense: item.isCompanyExpense,
      isStockMaterial: item.isStockMaterial,
    };
  }

  static toSpendingView(entry: SpendingByPeriod): SpendingByPeriodView {
    return {
      period: entry.period,
      netSpend: entry.netSpend.toDecimalString(),
      discountTotal: entry.discountTotal.toDecimalString(),
    };
  }
}
