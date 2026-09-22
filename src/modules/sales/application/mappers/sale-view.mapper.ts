import { Money } from '../../../../shared/domain/money/money';
import type { Sale } from '../../domain/sale.entity';
import type { SaleItem } from '../../domain/sale-item.entity';
import type { SaleItemView, SaleView } from '../dto/sales.dto';

export class SaleViewMapper {
  /**
   * `totalAmount` is derived here, from each item's frozen price basis, and
   * never persisted. It sums the already-rounded `lineTotal` of each line
   * rather than summing exactly and rounding at the end, so the total always
   * equals the lines shown above it — the same choice `calculateMaterialsCost`
   * makes, for the same reason.
   */
  static toView(sale: Sale, items: readonly SaleItem[]): SaleView {
    const itemViews = items.map((item) => SaleViewMapper.toItemView(item));
    const totalAmount = items.reduce((total, item) => total.plus(item.lineTotal), Money.zero());

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
      priceBasisAmount: item.priceBasisAmount.toDecimalString(),
      priceBasisQuantity: item.priceBasisQuantity,
      // Four places, display only — the client formats it, and derives no
      // amount of money from it. `lineTotal` is the figure that adds up.
      unitPrice: item.unitPrice,
      lineTotal: item.lineTotal.toDecimalString(),
    };
  }
}
