import {
  consumptionUnitSymbol,
  type ConsumptionUnit,
} from '../../../materials/domain/consumption-unit';
import type { Purchase } from '../../../purchases/domain/purchase.entity';
import type { PurchaseItem } from '../../../purchases/domain/purchase-item.entity';
import { normalizeInvoiceUnit } from '../../domain/invoice-unit';
import type { PendingInvoice } from '../../domain/pending-invoice.entity';
import type {
  ImportedInvoiceItemView,
  ImportedInvoiceView,
  PendingInvoiceView,
} from '../dto/invoices.dto';

export class InvoiceViewMapper {
  static toPendingView(invoice: PendingInvoice): PendingInvoiceView {
    return {
      id: invoice.id,
      url: invoice.url,
      status: invoice.status,
      attemptCount: invoice.attemptCount,
      lastAttemptAt: invoice.lastAttemptAt,
      purchaseId: invoice.purchaseId,
      lastError: invoice.lastError,
      createdAt: invoice.createdAt,
    };
  }

  /**
   * `materialUnits` carries the consumption unit of each `Material` the lines
   * already point at, so the classification screen can show the user what
   * unit their `packageQuantity` is being counted in. It is empty for a note
   * that has just been imported: no line has a Material yet.
   */
  static toImportedView(
    purchase: Purchase,
    pendingInvoiceId: string | null,
    materialUnits: ReadonlyMap<string, ConsumptionUnit>,
  ): ImportedInvoiceView {
    return {
      purchaseId: purchase.id,
      pendingInvoiceId,
      accessKey: purchase.accessKey,
      merchantName: readMerchantName(purchase),
      purchaseDate: purchase.purchaseDate,
      grossTotal: purchase.grossTotal.toDecimalString(),
      discountTotal: purchase.discountTotal.toDecimalString(),
      netTotal: purchase.netTotal.toDecimalString(),
      discountAllocationMode: purchase.discountAllocationMode,
      allocationPending: purchase.allocationPending,
      requiresDiscountAllocationChoice: purchase.requiresDiscountAllocationChoice,
      items: purchase.items.map((item) => InvoiceViewMapper.toItemView(item, materialUnits)),
    };
  }

  static toItemView(
    item: PurchaseItem,
    materialUnits: ReadonlyMap<string, ConsumptionUnit>,
  ): ImportedInvoiceItemView {
    const materialConsumptionUnit =
      item.materialId === null ? null : (materialUnits.get(item.materialId) ?? null);

    return {
      id: item.id,
      code: item.code,
      description: item.description,
      quantity: item.quantity,
      unit: item.unit,
      // Normalised for reading only. It is never what `packageQuantity` is
      // built from — that is always typed by the user.
      unitDisplay: item.unit === null ? null : normalizeInvoiceUnit(item.unit).display,
      unitPrice: item.unitPrice.toDecimalString(),
      grossValue: item.grossValue.toDecimalString(),
      allocatedDiscount: item.allocatedDiscount.toDecimalString(),
      netValue: item.netValue.toDecimalString(),
      isCompanyExpense: item.isCompanyExpense,
      isStockMaterial: item.isStockMaterial,
      materialId: item.materialId,
      materialConsumptionUnit,
      materialConsumptionUnitSymbol:
        materialConsumptionUnit === null ? null : consumptionUnitSymbol(materialConsumptionUnit),
    };
  }
}

/**
 * The merchant's name comes out of the frozen extraction rather than a column
 * of its own. `rawInvoiceData` is the captured note and is never rewritten,
 * so reading it back is reading what the note said at the time — which is the
 * whole reason it is kept.
 */
function readMerchantName(purchase: Purchase): string | null {
  const name = purchase.rawInvoiceData?.merchantName;

  return typeof name === 'string' ? name : null;
}
