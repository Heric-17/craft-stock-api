import { Money } from '../../../../shared/domain/money/money';
import type { Sale } from '../../domain/sale.entity';
import type { SaleItem } from '../../domain/sale-item.entity';
import type { SaleItemView, SaleView } from '../dto/sales.dto';

export class SaleViewMapper {
  /** `totalAmount` is derived here, from each item's snapshot, and never persisted. */
  static toView(sale: Sale, items: readonly SaleItem[]): SaleView {
    const itemViews = items.map((item) => SaleViewMapper.toItemView(item));
    const totalAmount = items.reduce((total, item) => total.plus(item.subtotal), Money.zero());

    return {
      id: sale.id,
      customerName: sale.customerName,
      customerContact: sale.customerContact,
      paymentMethod: sale.paymentMethod,
      paymentStatus: sale.paymentStatus,
      productionStatus: sale.productionStatus,
      items: itemViews,
      totalAmount: totalAmount.toDecimalString(),
      createdAt: sale.createdAt,
      updatedAt: sale.updatedAt,
    };
  }

  static toItemView(item: SaleItem): SaleItemView {
    return {
      id: item.id,
      compositeProductId: item.compositeProductId,
      materialId: item.materialId,
      quantity: item.quantity,
      itemNameSnapshot: item.itemNameSnapshot,
      unitPriceSnapshot: item.unitPriceSnapshot.toDecimalString(),
      subtotal: item.subtotal.toDecimalString(),
    };
  }
}
