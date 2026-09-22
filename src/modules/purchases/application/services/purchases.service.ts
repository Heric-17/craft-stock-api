import { randomUUID } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';

import { Money } from '../../../../shared/domain/money/money';
import {
  UNIT_OF_WORK,
  type RepositoryContext,
  type UnitOfWork,
} from '../../../../shared/domain/persistence/unit-of-work';
import { MaterialPriceHistory } from '../../../materials/domain/material-price-history.entity';
import { Purchase } from '../../domain/purchase.entity';
import { PurchaseItem } from '../../domain/purchase-item.entity';
import { InvalidPurchaseError, UnknownMaterialReferenceError } from '../../domain/purchase.error';
import type { PurchaseView, RegisterInvoicePurchaseInput } from '../dto/purchases.dto';
import { PurchaseViewMapper } from '../mappers/purchase-view.mapper';

@Injectable()
export class PurchasesService {
  constructor(@Inject(UNIT_OF_WORK) private readonly unitOfWork: UnitOfWork) {}

  /**
   * Records an invoice as a `Purchase`, with both sides of every line, and
   * feeds the gross side into the `Material`s the lines were matched to.
   *
   * Everything happens in one transaction because the two sides are one fact:
   * a purchase whose lines were written but whose costs were not is a purchase
   * that silently prices products off yesterday's costs.
   */
  async registerInvoicePurchase(input: RegisterInvoicePurchaseInput): Promise<PurchaseView> {
    const now = new Date();
    const grossTotal = Money.fromDecimalString(input.grossTotal);
    const discountTotal = Money.fromDecimalString(input.discountTotal);
    const netTotal = grossTotal.minus(discountTotal);

    if (input.lines.length === 0) {
      throw new InvalidPurchaseError('An invoice purchase must have at least one line.');
    }

    const purchaseId = randomUUID();

    const items = input.lines.map(
      (line) =>
        new PurchaseItem({
          id: randomUUID(),
          purchaseId,
          code: line.code ?? null,
          description: line.description,
          quantity: line.quantity,
          unit: line.unit ?? null,
          unitPrice: Money.fromDecimalString(line.unitPrice),
          grossValue: Money.fromDecimalString(line.grossValue),
          // Attributed by the root below, once every line is in place.
          allocatedDiscount: Money.zero(),
          isCompanyExpense: line.isCompanyExpense,
          isStockMaterial: line.materialId !== null,
          materialId: line.materialId,
        }),
    );

    const linesTotal = items.reduce((total, item) => total.plus(item.grossValue), Money.zero());

    // The header totals are captured from the note, not recomputed from the
    // lines — so they are checked against them instead. A header that does not
    // close over its own lines means the note was read wrong, and attributing
    // the discount over it would spread that error across every cost in the
    // system.
    if (!linesTotal.equals(grossTotal)) {
      throw new InvalidPurchaseError(
        `Invoice lines add up to ${linesTotal.toDecimalString()}, which does not match the reported grossTotal of ${grossTotal.toDecimalString()}.`,
      );
    }

    const mode = input.discountAllocationMode ?? 'PROPORTIONAL';

    // MANUAL attributes by line id, and the ids are minted right here, so the
    // caller has nothing to key its amounts to. Typing them is an operation on
    // an existing purchase — `changeDiscountAllocation` through the
    // classification endpoint — not part of creating one.
    if (mode === 'MANUAL') {
      throw new InvalidPurchaseError(
        'MANUAL discount allocation cannot be chosen while the purchase is being created: its line ids do not exist yet. Create the purchase, then set the allocation on it.',
      );
    }

    // Built with the discount unattributed and attributed by the root, so
    // there is exactly one piece of code in the system that decides where a
    // note's discount lands.
    const purchase = new Purchase({
      id: purchaseId,
      purchaseDate: input.purchaseDate,
      accessKey: input.accessKey,
      rawInvoiceData: input.rawInvoiceData,
      grossTotal,
      discountTotal,
      netTotal,
      discountAllocationMode: mode,
      allocationPending: !discountTotal.isZero(),
      items,
      createdAt: now,
    }).changeDiscountAllocation(mode);

    await this.unitOfWork.runInTransaction(async (ctx) => {
      await ctx.purchases.save(purchase);

      for (const item of purchase.items) {
        await this.applyPackageCost(ctx, item, now);
      }
    });

    return PurchaseViewMapper.toView(purchase);
  }

  /**
   * Reports this line's package cost to the `Material` it was matched to. The
   * figure handed over is `packageCostBasis`, which comes from the line's
   * gross value: what it costs to replace the Material, not what this
   * particular note happened to charge after its discount. The Material
   * itself decides whether to take it — it only ever accepts an increase.
   */
  private async applyPackageCost(
    ctx: RepositoryContext,
    item: PurchaseItem,
    now: Date,
  ): Promise<void> {
    if (item.materialId === null) {
      return;
    }

    const material = await ctx.materials.findById(item.materialId);

    if (!material) {
      throw new UnknownMaterialReferenceError(
        `Invoice line "${item.description}" references Material ${item.materialId}, which does not exist.`,
      );
    }

    const updated = material.receiveInvoicePackageCost(item.packageCostBasis, now);

    if (updated.packageCost.equals(material.packageCost)) {
      return;
    }

    await ctx.materials.save(updated);
    await ctx.materials.addPriceHistoryEntry(
      new MaterialPriceHistory({
        id: randomUUID(),
        materialId: updated.id,
        previousValue: material.packageCost,
        newValue: updated.packageCost,
        origin: 'INVOICE_SYNC',
        changedAt: now,
      }),
    );
  }
}
