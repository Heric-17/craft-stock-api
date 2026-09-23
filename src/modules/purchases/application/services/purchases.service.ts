import { randomUUID } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';

import { Money } from '../../../../shared/domain/money/money';
import {
  UNIT_OF_WORK,
  type RepositoryContext,
  type UnitOfWork,
} from '../../../../shared/domain/persistence/unit-of-work';
import { MaterialPriceHistory } from '../../../materials/domain/material-price-history.entity';
import type { DiscountAllocationMode } from '../../domain/discount-allocation-mode';
import { Establishment } from '../../domain/establishment';
import { Purchase } from '../../domain/purchase.entity';
import { PurchaseItem } from '../../domain/purchase-item.entity';
import {
  InvalidPurchaseError,
  PurchaseNotFoundError,
  UnknownMaterialReferenceError,
} from '../../domain/purchase.error';
import {
  PURCHASE_REPOSITORY,
  type PurchaseRepository,
} from '../../domain/repositories/purchase.repository';
import type {
  EstablishmentInput,
  InvoiceLineInput,
  PurchaseDetailView,
  PurchaseListInput,
  PurchasePageView,
  PurchaseView,
  RegisterInvoicePurchaseInput,
  RegisterManualPurchaseInput,
} from '../dto/purchases.dto';
import { PurchaseViewMapper } from '../mappers/purchase-view.mapper';

@Injectable()
export class PurchasesService {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: UnitOfWork,
    @Inject(PURCHASE_REPOSITORY) private readonly purchases: PurchaseRepository,
  ) {}

  /**
   * One page of the history, newest first, narrowed by period and by shop.
   *
   * Paging is the documented answer to a long list and only to that. It is
   * deliberately not how the spending panel is fed: a page of rows cannot be
   * folded into the totals of a period, so the panel reads the aggregated
   * dataset instead.
   */
  async list(input: PurchaseListInput): Promise<PurchasePageView> {
    const page = await this.purchases.findPage({
      ...(input.from !== undefined ? { from: input.from } : {}),
      ...(input.to !== undefined ? { to: input.to } : {}),
      ...(input.establishmentId !== undefined ? { establishmentId: input.establishmentId } : {}),
      limit: input.limit,
      offset: input.offset,
    });

    return PurchaseViewMapper.toPageView(page);
  }

  /** The purchase with its lines and the captured note, exactly as captured. */
  async getById(id: string): Promise<PurchaseDetailView> {
    const purchase = await this.purchases.findById(id);

    if (purchase === null) {
      throw new PurchaseNotFoundError(`Purchase ${id} does not exist.`);
    }

    return PurchaseViewMapper.toDetailView(purchase);
  }

  /**
   * Records an invoice as a `Purchase`, with both sides of every line, and
   * feeds the gross side into the `Material`s the lines were matched to.
   *
   * Everything happens in one transaction because the two sides are one fact:
   * a purchase whose lines were written but whose costs were not is a purchase
   * that silently prices products off yesterday's costs.
   */
  async registerInvoicePurchase(input: RegisterInvoicePurchaseInput): Promise<PurchaseView> {
    const grossTotal = Money.fromDecimalString(input.grossTotal);
    const items = this.buildItems(input.lines);
    const linesTotal = sumGross(items);

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

    return this.register({
      purchaseDate: input.purchaseDate,
      accessKey: input.accessKey,
      rawInvoiceData: input.rawInvoiceData,
      establishment: input.establishment ?? null,
      grossTotal,
      discountTotal: Money.fromDecimalString(input.discountTotal),
      mode: input.discountAllocationMode ?? 'PROPORTIONAL',
      items,
    });
  }

  /**
   * Records a purchase the user typed in, with no note behind it.
   *
   * It differs from an imported one in what it lacks and nothing else: no
   * access key to deduplicate against, and no `rawInvoiceData`, because there
   * is no captured document to freeze. The header total is therefore the sum
   * of the lines — there is no issuer's figure to check them against, so
   * there is nothing for them to disagree with.
   *
   * The cost policy is the same one: every line reports its gross package
   * cost to the `Material` it names, and the `Material` takes it only when it
   * is an increase. Bringing the quantities into stock stays a separate
   * operation, as it is for an imported note, because it needs the
   * `packageQuantity` that only the user can give.
   */
  async registerManualPurchase(input: RegisterManualPurchaseInput): Promise<PurchaseView> {
    const items = this.buildItems(input.lines);

    return this.register({
      purchaseDate: input.purchaseDate,
      accessKey: null,
      rawInvoiceData: null,
      establishment: input.establishment ?? null,
      grossTotal: sumGross(items),
      discountTotal:
        input.discountTotal === undefined
          ? Money.zero()
          : Money.fromDecimalString(input.discountTotal),
      mode: input.discountAllocationMode ?? 'PROPORTIONAL',
      items,
    });
  }

  /**
   * The one path that creates a purchase, whichever way its lines arrived.
   *
   * The purchase is built with its discount unattributed and attributed by
   * the root immediately afterwards, so there is exactly one piece of code in
   * the system that decides where a discount lands.
   */
  private async register(input: {
    purchaseDate: Date;
    accessKey: string | null;
    rawInvoiceData: Record<string, unknown> | null;
    establishment: EstablishmentInput | null;
    grossTotal: Money;
    discountTotal: Money;
    mode: DiscountAllocationMode;
    items: PurchaseItem[];
  }): Promise<PurchaseView> {
    if (input.items.length === 0) {
      throw new InvalidPurchaseError('A purchase must have at least one line.');
    }

    // MANUAL attributes by line id, and the ids are minted right here, so the
    // caller has nothing to key its amounts to. Typing them is an operation on
    // an existing purchase — `setDiscountAllocation` — and not part of
    // creating one.
    if (input.mode === 'MANUAL') {
      throw new InvalidPurchaseError(
        'MANUAL discount allocation cannot be chosen while the purchase is being created: its line ids do not exist yet. Create the purchase, then set the allocation on it.',
      );
    }

    const now = new Date();
    const purchase = new Purchase({
      id: input.items[0].purchaseId,
      purchaseDate: input.purchaseDate,
      accessKey: input.accessKey,
      rawInvoiceData: input.rawInvoiceData,
      establishment:
        input.establishment === null
          ? null
          : new Establishment({
              name: input.establishment.name,
              cnpj: input.establishment.cnpj ?? null,
            }),
      grossTotal: input.grossTotal,
      discountTotal: input.discountTotal,
      netTotal: input.grossTotal.minus(input.discountTotal),
      discountAllocationMode: input.mode,
      allocationPending: !input.discountTotal.isZero(),
      items: input.items,
      createdAt: now,
    }).changeDiscountAllocation(input.mode);

    await this.unitOfWork.runInTransaction(async (ctx) => {
      await ctx.purchases.save(purchase);

      for (const item of purchase.items) {
        await this.applyPackageCost(ctx, item, now);
      }
    });

    return PurchaseViewMapper.toView(purchase);
  }

  private buildItems(lines: readonly InvoiceLineInput[]): PurchaseItem[] {
    const purchaseId = randomUUID();

    return lines.map(
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
          // Attributed by the root once every line is in place.
          allocatedDiscount: Money.zero(),
          isCompanyExpense: line.isCompanyExpense,
          isStockMaterial: line.materialId !== null,
          materialId: line.materialId,
        }),
    );
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
        `Purchase line "${item.description}" references Material ${item.materialId}, which does not exist.`,
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

function sumGross(items: readonly PurchaseItem[]): Money {
  return items.reduce((total, item) => total.plus(item.grossValue), Money.zero());
}
