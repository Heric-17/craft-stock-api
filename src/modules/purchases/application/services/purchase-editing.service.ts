import { randomUUID } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';

import { Money } from '../../../../shared/domain/money/money';
import { RequestContextService } from '../../../../shared/infrastructure/logging/request-context.service';
import {
  UNIT_OF_WORK,
  type RepositoryContext,
  type UnitOfWork,
} from '../../../../shared/domain/persistence/unit-of-work';
import type { ManualAllocation } from '../../domain/discount-allocation';
import { Purchase, type ItemValueChange } from '../../domain/purchase.entity';
import { DiscountAllocationError, PurchaseNotFoundError } from '../../domain/purchase.error';
import type {
  AddPurchaseItemInput,
  ChangePurchaseItemInput,
  PurchaseDetailView,
  SetDiscountAllocationInput,
} from '../dto/purchases.dto';
import { PurchaseViewMapper } from '../mappers/purchase-view.mapper';

/**
 * Editing the lines of a purchase that is already recorded.
 *
 * One rule governs the whole service, and it is the reason the captured note
 * exists: editing the items NEVER touches `rawInvoiceData`. The snapshot is
 * what the user reconciles the purchase against on the card statement, so it
 * has to keep saying what the note said, however far the lines drift from it
 * afterwards. Nothing here writes it — the aggregate carries it through every
 * operation frozen, and the repository does not name the column in an UPDATE
 * at all.
 *
 * The second rule is about `MANUAL`. In every computed mode the root
 * reattributes after each edit and the sum closes again by itself. Under
 * `MANUAL` there is nothing to recompute: the system cannot know where the
 * discount of a removed line should go, nor how much to give a new one, and a
 * line whose value was corrected may now be holding more discount than it is
 * worth. So the purchase is parked in pending attribution — left out of the
 * spending panel, and refused at `completeEdit` — until the user restates it.
 */
@Injectable()
export class PurchaseEditingService {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: UnitOfWork,
    private readonly requestContext: RequestContextService,
  ) {}

  async addItem(purchaseId: string, input: AddPurchaseItemInput): Promise<PurchaseDetailView> {
    // Reattribution runs as a side effect of every item edit (see the class
    // doc comment), so a resulting PurchaseItem.allocatedDiscount change
    // reads, from the diff alone, exactly like a deliberate discount-mode
    // change would. `intent` is the one thing that tells them apart in the
    // audit trail (§15.2).
    this.requestContext.setIntent('purchase_item_edit');

    return this.edit(purchaseId, (purchase) =>
      purchase.addItem({
        id: randomUUID(),
        code: input.code ?? null,
        description: input.description,
        quantity: input.quantity,
        unit: input.unit ?? null,
        unitPrice: Money.fromDecimalString(input.unitPrice),
        grossValue: Money.fromDecimalString(input.grossValue),
        isCompanyExpense: input.isCompanyExpense,
        isStockMaterial: input.materialId !== null,
        materialId: input.materialId,
      }),
    );
  }

  async removeItem(purchaseId: string, itemId: string): Promise<PurchaseDetailView> {
    this.requestContext.setIntent('purchase_item_edit');

    return this.edit(purchaseId, (purchase) => purchase.removeItem(itemId));
  }

  async changeItem(
    purchaseId: string,
    itemId: string,
    input: ChangePurchaseItemInput,
  ): Promise<PurchaseDetailView> {
    this.requestContext.setIntent('purchase_item_edit');

    const change: ItemValueChange = {
      ...(input.quantity !== undefined ? { quantity: input.quantity } : {}),
      ...(input.unitPrice !== undefined
        ? { unitPrice: Money.fromDecimalString(input.unitPrice) }
        : {}),
      ...(input.grossValue !== undefined
        ? { grossValue: Money.fromDecimalString(input.grossValue) }
        : {}),
    };

    return this.edit(purchaseId, (purchase) => purchase.changeItemValue(itemId, change));
  }

  /**
   * Sets how the discount is attributed, and attributes it in the same
   * operation. This is also the way out of a pending `MANUAL` attribution:
   * the amounts the user types here are what closes the sum again.
   */
  async setDiscountAllocation(
    purchaseId: string,
    input: SetDiscountAllocationInput,
  ): Promise<PurchaseDetailView> {
    const manual = toManualAllocation(input);

    this.requestContext.setIntent('discount_allocation_change');

    return this.edit(purchaseId, (purchase) =>
      manual === undefined
        ? purchase.changeDiscountAllocation(input.mode)
        : purchase.changeDiscountAllocation(input.mode, manual),
    );
  }

  /**
   * Closes the edit. Refused while a manual attribution is pending: from the
   * moment a purchase carries only part of its discount, every figure derived
   * from it is wrong and looks right, which is exactly what the spending
   * panel must never be fed.
   */
  async completeEdit(purchaseId: string): Promise<PurchaseDetailView> {
    return this.edit(purchaseId, (purchase) => purchase.completeEdit());
  }

  /**
   * Loads the aggregate, applies one operation of the root to it and saves
   * the whole thing back, inside a transaction.
   *
   * Every edit goes through here, and every edit is an operation of the root:
   * there is no path that reaches a single line, which is what keeps
   * `allocatedDiscount` from being saved out of step with the classification
   * it depends on.
   */
  private async edit(
    purchaseId: string,
    operation: (purchase: Purchase) => Purchase,
  ): Promise<PurchaseDetailView> {
    return this.unitOfWork.runInTransaction(async (ctx: RepositoryContext) => {
      const purchase = await ctx.purchases.findById(purchaseId);

      if (purchase === null) {
        throw new PurchaseNotFoundError(`Purchase ${purchaseId} does not exist.`);
      }

      const edited = operation(purchase);

      await ctx.purchases.save(edited);

      return PurchaseViewMapper.toDetailView(edited);
    });
  }
}

function toManualAllocation(input: SetDiscountAllocationInput): ManualAllocation | undefined {
  if (input.mode !== 'MANUAL') {
    if (input.manualAllocation !== undefined) {
      throw new DiscountAllocationError(
        `Per-line amounts were given with mode ${input.mode}, which computes them. They are only accepted by MANUAL.`,
      );
    }

    return undefined;
  }

  if (input.manualAllocation === undefined) {
    throw new DiscountAllocationError(
      'MANUAL discount allocation requires an amount for each line.',
    );
  }

  return new Map<string, Money>(
    input.manualAllocation.map((entry) => [
      entry.itemId,
      Money.fromDecimalString(entry.allocatedDiscount),
    ]),
  );
}
