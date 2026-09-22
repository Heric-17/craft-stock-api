import { randomUUID } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';

import { Money } from '../../../../shared/domain/money/money';
import {
  UNIT_OF_WORK,
  type RepositoryContext,
  type UnitOfWork,
} from '../../../../shared/domain/persistence/unit-of-work';
import type { ConsumptionUnit } from '../../../materials/domain/consumption-unit';
import { Material } from '../../../materials/domain/material.entity';
import { MaterialPriceHistory } from '../../../materials/domain/material-price-history.entity';
import { MaterialNotFoundError } from '../../../materials/domain/material.error';
import type { DiscountAllocationMode } from '../../../purchases/domain/discount-allocation-mode';
import type { ManualAllocation } from '../../../purchases/domain/discount-allocation';
import type { ItemClassification } from '../../../purchases/domain/purchase.entity';
import { Purchase } from '../../../purchases/domain/purchase.entity';
import type { PurchaseItem } from '../../../purchases/domain/purchase-item.entity';
import {
  DiscountAllocationError,
  InvalidPurchaseError,
  PurchaseNotFoundError,
} from '../../../purchases/domain/purchase.error';
import type {
  ClassifyInvoiceInput,
  ClassifyInvoiceItemInput,
  ImportedInvoiceView,
} from '../dto/invoices.dto';
import { InvoiceViewMapper } from '../mappers/invoice-view.mapper';

/**
 * The step after the import: the user says, line by line, what the note
 * actually bought.
 *
 * Two things only the user can answer happen here. Which lines are a company
 * expense and which are stock, because the note does not distinguish them.
 * And how much of the consumption unit a package holds — the note calls a
 * packet of cheese one packet, while the kitchen measures it in grams.
 *
 * Whatever the discount mode, a `Material`'s `packageCost` is fed from
 * `grossValue`. A discount is a one-off event and the cost recorded here is
 * what restocking will cost next time; pricing a `CompositeProduct` off a
 * promotional price assumes the promotion lasts, and when it does not, the
 * business either sells at a loss or has to move an advertised price.
 */
@Injectable()
export class InvoiceClassificationService {
  constructor(@Inject(UNIT_OF_WORK) private readonly unitOfWork: UnitOfWork) {}

  async classify(input: ClassifyInvoiceInput): Promise<ImportedInvoiceView> {
    return this.unitOfWork.runInTransaction(async (ctx) => {
      const loaded = await ctx.purchases.findById(input.purchaseId);

      if (loaded === null) {
        throw new PurchaseNotFoundError(`Purchase ${input.purchaseId} does not exist.`);
      }

      const { purchase, stockLines } = await this.applyClassification(ctx, loaded, input);

      // Refuses to close while a manual attribution is still pending: a
      // purchase carrying only part of its discount is one whose every
      // derived figure is wrong and looks right.
      const completed = purchase.completeEdit();

      await ctx.purchases.save(completed);

      for (const itemId of stockLines) {
        const item = completed.findItem(itemId);

        if (item !== null) {
          await this.applyStockEntry(ctx, item);
        }
      }

      return InvoiceViewMapper.toImportedView(
        completed,
        null,
        await this.readConsumptionUnits(ctx, completed),
      );
    });
  }

  /**
   * The consumption unit of every `Material` the classified lines ended up
   * pointing at.
   *
   * It goes back with the response so the user sees, beside each line, the
   * unit the `packageQuantity` they just gave is counted in — the one check
   * that catches "1 packet" having been entered as 1 against a Material
   * measured in grams.
   */
  private async readConsumptionUnits(
    ctx: RepositoryContext,
    purchase: Purchase,
  ): Promise<ReadonlyMap<string, ConsumptionUnit>> {
    const units = new Map<string, ConsumptionUnit>();

    for (const materialId of new Set(
      purchase.items
        .map((item) => item.materialId)
        .filter((materialId): materialId is string => materialId !== null),
    )) {
      const material = await ctx.materials.findById(materialId);

      if (material !== null) {
        units.set(material.id, material.consumptionUnit);
      }
    }

    return units;
  }

  /**
   * Resolves the Materials the stock lines point at, then hands the whole
   * classification to the root as ONE operation.
   *
   * Applying it line by line would be wrong, not merely slower: each call
   * reattributes, so the batch would be judged at every intermediate step.
   * Flipping two lines under `COMPANY_ONLY` leaves no company line halfway
   * through, and moving a single-line note from personal to company under
   * `PERSONAL_ONLY` empties that group halfway through. Both requests are
   * valid end to end, and both would be rejected in the middle.
   */
  private async applyClassification(
    ctx: RepositoryContext,
    purchase: Purchase,
    input: ClassifyInvoiceInput,
  ): Promise<{ purchase: Purchase; stockLines: string[] }> {
    const stockLines: string[] = [];
    const changes: { itemId: string; classification: ItemClassification }[] = [];

    for (const line of input.items) {
      const item = purchase.findItem(line.itemId);

      if (item === null) {
        throw new InvalidPurchaseError(`Purchase ${purchase.id} has no item ${line.itemId}.`);
      }

      changes.push({
        itemId: line.itemId,
        classification: {
          isCompanyExpense: line.isCompanyExpense,
          isStockMaterial: line.isStockMaterial,
          materialId: line.isStockMaterial ? await this.resolveMaterial(ctx, item, line) : null,
        },
      });

      if (line.isStockMaterial) {
        stockLines.push(line.itemId);
      }
    }

    return {
      purchase: purchase.classifyItems(changes, this.resolveAllocation(purchase, input)),
      stockLines,
    };
  }

  /**
   * The attribution the user chose, travelling with the classification so the
   * two are one operation. A note with no discount never raises the question:
   * every line is zero whatever the mode, so the choice is simply not applied.
   */
  private resolveAllocation(
    purchase: Purchase,
    input: ClassifyInvoiceInput,
  ): { mode: DiscountAllocationMode; manual?: ManualAllocation } | undefined {
    if (input.discountAllocationMode === undefined || !purchase.hasDiscount) {
      return undefined;
    }

    const manual = this.toManualAllocation(input.discountAllocationMode, input.manualAllocation);

    return manual === undefined
      ? { mode: input.discountAllocationMode }
      : { mode: input.discountAllocationMode, manual };
  }

  /**
   * Finds or creates the `Material` a line stocks.
   *
   * `packageQuantity` and the consumption unit both come from the user and
   * never from the note. The unit printed on the note (`UND9`, `KG9`, `PCT9`)
   * is shown to help the user decide and stops there — it describes how the
   * item was rung up, not how it is consumed, and a till that prints `KG` for
   * something the kitchen measures in grams is the normal case rather than
   * the exception.
   *
   * A line pointing at an existing Material keeps that Material's unit
   * untouched: the `packageQuantity` given here is read as being in it, and
   * the unit is sent back in the response for the user to check against what
   * they typed.
   */
  private async resolveMaterial(
    ctx: RepositoryContext,
    item: PurchaseItem,
    line: ClassifyInvoiceItemInput,
  ): Promise<string> {
    if (line.packageQuantity === undefined || line.packageQuantity <= 0) {
      throw new InvalidPurchaseError(
        `Line "${item.description}" was marked as stock, so it needs a packageQuantity: how much of the consumption unit one package holds. The invoice cannot answer this.`,
      );
    }

    if (line.materialId !== undefined) {
      const existing = await ctx.materials.findById(line.materialId);

      if (existing === null) {
        throw new MaterialNotFoundError(`Material ${line.materialId} does not exist.`);
      }

      if (existing.packageQuantity !== line.packageQuantity) {
        await ctx.materials.save(
          existing.update({ packageQuantity: line.packageQuantity }, new Date()),
        );
      }

      return existing.id;
    }

    if (line.newMaterial === undefined) {
      throw new InvalidPurchaseError(
        `Line "${item.description}" was marked as stock but names neither an existing Material nor a new one.`,
      );
    }

    const now = new Date();
    const material = new Material({
      id: randomUUID(),
      name: line.newMaterial.name,
      description: null,
      imageUrl: null,
      // Always the gross side, in every allocation mode.
      packageCost: item.packageCostBasis,
      packageQuantity: line.packageQuantity,
      consumptionUnit: line.newMaterial.consumptionUnit,
      stockQuantity: 0,
      minimumStockAlert: line.newMaterial.minimumStockAlert ?? 0,
      discontinuedAt: null,
      createdAt: now,
      updatedAt: now,
    });

    await ctx.materials.save(material);

    // A giveaway line costs nothing, and a history entry from zero to zero is
    // not a price change.
    if (!material.packageCost.isZero()) {
      await ctx.materials.addPriceHistoryEntry(
        new MaterialPriceHistory({
          id: randomUUID(),
          materialId: material.id,
          previousValue: Money.zero(),
          newValue: material.packageCost,
          origin: 'CREATION',
          changedAt: now,
        }),
      );
    }

    return material.id;
  }

  private toManualAllocation(
    mode: DiscountAllocationMode,
    entries: ClassifyInvoiceInput['manualAllocation'],
  ): ManualAllocation | undefined {
    if (mode !== 'MANUAL') {
      return undefined;
    }

    if (entries === undefined) {
      throw new DiscountAllocationError(
        'MANUAL discount allocation requires an amount for each line.',
      );
    }

    return new Map(
      entries.map((entry) => [entry.itemId, Money.fromDecimalString(entry.allocatedDiscount)]),
    );
  }

  /**
   * Brings the line into stock and reports its cost to the `Material`.
   *
   * The quantity added is the note's quantity times the packages' contents:
   * two packets of 200 g add 400 g of the consumption unit.
   *
   * The cost handed over is `packageCostBasis`, from the gross side, and the
   * `Material` decides whether to take it — it only ever accepts an increase.
   * The recorded cost therefore converges on the highest price ever seen and
   * never falls, which is conservative on purpose: it protects the margin,
   * and whether a one-off expensive purchase is passed on to the customer is
   * a commercial decision the system does not make on the seller's behalf.
   */
  private async applyStockEntry(ctx: RepositoryContext, item: PurchaseItem): Promise<void> {
    if (item.materialId === null) {
      return;
    }

    const material = await ctx.materials.findById(item.materialId);

    if (material === null) {
      throw new MaterialNotFoundError(`Material ${item.materialId} does not exist.`);
    }

    const now = new Date();
    const entered = material.withStockQuantity(
      material.stockQuantity + item.quantity * material.packageQuantity,
      now,
    );
    const repriced = entered.receiveInvoicePackageCost(item.packageCostBasis, now);

    await ctx.materials.save(repriced);

    if (!repriced.packageCost.equals(material.packageCost)) {
      await ctx.materials.addPriceHistoryEntry(
        new MaterialPriceHistory({
          id: randomUUID(),
          materialId: repriced.id,
          previousValue: material.packageCost,
          newValue: repriced.packageCost,
          origin: 'INVOICE_SYNC',
          changedAt: now,
        }),
      );
    }
  }
}
