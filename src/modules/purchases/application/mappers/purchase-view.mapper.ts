import type { Establishment } from '../../domain/establishment';
import type {
  SpendingByEstablishment,
  SpendingByPeriod,
  SpendingDataset,
} from '../../domain/ports/purchase-analytics.port';
import type { Purchase } from '../../domain/purchase.entity';
import type { PurchaseItem } from '../../domain/purchase-item.entity';
import type { PurchasePage } from '../../domain/repositories/purchase.repository';
import type {
  EstablishmentView,
  PurchaseDetailView,
  PurchaseItemView,
  PurchasePageView,
  PurchaseSummaryView,
  PurchaseView,
  SpendingByEstablishmentView,
  SpendingByPeriodView,
  SpendingDatasetView,
} from '../dto/purchases.dto';

export class PurchaseViewMapper {
  static toView(purchase: Purchase): PurchaseView {
    return {
      id: purchase.id,
      purchaseDate: purchase.purchaseDate,
      accessKey: purchase.accessKey,
      establishment: PurchaseViewMapper.toEstablishmentView(purchase.establishment),
      grossTotal: purchase.grossTotal.toDecimalString(),
      discountTotal: purchase.discountTotal.toDecimalString(),
      netTotal: purchase.netTotal.toDecimalString(),
      discountAllocationMode: purchase.discountAllocationMode,
      allocationPending: purchase.allocationPending,
      createdAt: purchase.createdAt,
      items: purchase.items.map((item) => PurchaseViewMapper.toItemView(item)),
    };
  }

  /**
   * The detail, with the captured note handed back untouched. It is read
   * straight off the aggregate and never reassembled from the lines: the
   * lines are editable and the note is not, which is the entire reason the
   * snapshot is kept.
   */
  static toDetailView(purchase: Purchase): PurchaseDetailView {
    return { ...PurchaseViewMapper.toView(purchase), rawInvoiceData: purchase.rawInvoiceData };
  }

  static toSummaryView(purchase: Purchase): PurchaseSummaryView {
    return {
      id: purchase.id,
      purchaseDate: purchase.purchaseDate,
      accessKey: purchase.accessKey,
      establishment: PurchaseViewMapper.toEstablishmentView(purchase.establishment),
      grossTotal: purchase.grossTotal.toDecimalString(),
      discountTotal: purchase.discountTotal.toDecimalString(),
      netTotal: purchase.netTotal.toDecimalString(),
      discountAllocationMode: purchase.discountAllocationMode,
      allocationPending: purchase.allocationPending,
      itemCount: purchase.items.length,
      hasInvoice: purchase.rawInvoiceData !== null,
      createdAt: purchase.createdAt,
    };
  }

  static toPageView(page: PurchasePage): PurchasePageView {
    return {
      items: page.purchases.map((purchase) => PurchaseViewMapper.toSummaryView(purchase)),
      total: page.total,
      limit: page.limit,
      offset: page.offset,
    };
  }

  static toEstablishmentView(establishment: Establishment | null): EstablishmentView | null {
    return establishment === null
      ? null
      : { id: establishment.id, name: establishment.name, cnpj: establishment.cnpj };
  }

  static toItemView(item: PurchaseItem): PurchaseItemView {
    return {
      id: item.id,
      materialId: item.materialId,
      code: item.code,
      description: item.description,
      quantity: item.quantity,
      unit: item.unit,
      unitPrice: item.unitPrice.toDecimalString(),
      grossValue: item.grossValue.toDecimalString(),
      allocatedDiscount: item.allocatedDiscount.toDecimalString(),
      netValue: item.netValue.toDecimalString(),
      isCompanyExpense: item.isCompanyExpense,
      isStockMaterial: item.isStockMaterial,
    };
  }

  static toSpendingView(dataset: SpendingDataset): SpendingDatasetView {
    return {
      from: dataset.from,
      to: dataset.to,
      granularity: dataset.granularity,
      byPeriod: dataset.byPeriod.map((bucket) => PurchaseViewMapper.toPeriodView(bucket)),
      byEstablishment: dataset.byEstablishment.map((bucket) =>
        PurchaseViewMapper.toEstablishmentSpendingView(bucket),
      ),
    };
  }

  private static toPeriodView(bucket: SpendingByPeriod): SpendingByPeriodView {
    return {
      period: bucket.period,
      netSpend: bucket.netSpend.toDecimalString(),
      discountTotal: bucket.discountTotal.toDecimalString(),
      purchaseCount: bucket.purchaseCount,
    };
  }

  private static toEstablishmentSpendingView(
    bucket: SpendingByEstablishment,
  ): SpendingByEstablishmentView {
    return {
      establishmentId: bucket.establishmentId,
      establishmentName: bucket.establishmentName,
      netSpend: bucket.netSpend.toDecimalString(),
      discountTotal: bucket.discountTotal.toDecimalString(),
      purchaseCount: bucket.purchaseCount,
    };
  }
}
