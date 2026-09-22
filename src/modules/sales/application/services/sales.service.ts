import { randomUUID } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';

import { Money } from '../../../../shared/domain/money/money';
import {
  UNIT_OF_WORK,
  type RepositoryContext,
  type UnitOfWork,
} from '../../../../shared/domain/persistence/unit-of-work';
import type { CompositeProduct } from '../../../composite-products/domain/composite-product.entity';
import {
  calculateFinalPrice,
  calculateMaterialsCost,
  calculateSuggestedPrice,
  calculateTotalCost,
} from '../../../composite-products/domain/composite-product-pricing';
import {
  COMPOSITE_PRODUCT_REPOSITORY,
  type CompositeProductRepository,
} from '../../../composite-products/domain/repositories/composite-product.repository';
import { consumptionUnitSymbol } from '../../../materials/domain/consumption-unit';
import type { Material } from '../../../materials/domain/material.entity';
import {
  MATERIAL_REPOSITORY,
  type MaterialRepository,
} from '../../../materials/domain/repositories/material.repository';
import { calculateLooseMaterialPriceBasis } from '../../domain/loose-material-pricing';
import {
  calculateMaterialNeed,
  type BomNeedLine,
  type SaleItemNeedInput,
} from '../../domain/material-need';
import type { PaymentStatus } from '../../domain/payment-status.enum';
import type { ProductionStatus } from '../../domain/production-status.enum';
import { SALE_REPOSITORY, type SaleRepository } from '../../domain/repositories/sale.repository';
import { SaleItem } from '../../domain/sale-item.entity';
import { Sale } from '../../domain/sale.entity';
import {
  DiscontinuedCompositeProductReferenceError,
  DiscontinuedMaterialReferenceError,
  EmptySaleError,
  InvalidSaleError,
  MissingLooseMaterialMarginError,
  SaleItemNotFoundError,
  SaleNotEditableError,
  SaleNotFoundError,
  UnexpectedMarginError,
  UnknownCompositeProductReferenceError,
  UnknownMaterialReferenceError,
} from '../../domain/sale.error';
import { calculateShortage, type ShortageLine } from '../../domain/shortage';
import { calculateStockDebit } from '../../domain/stock-debit';
import { StockMovementSnapshot } from '../../domain/stock-movement-snapshot.entity';
import type {
  CreateSaleInput,
  CreateSaleItemInput,
  SaleListFilter,
  SaleView,
  ShoppingListLineView,
  UpdateSaleDetailsInput,
} from '../dto/sales.dto';
import { SaleViewMapper } from '../mappers/sale-view.mapper';

@Injectable()
export class SalesService {
  constructor(
    @Inject(SALE_REPOSITORY) private readonly sales: SaleRepository,
    @Inject(MATERIAL_REPOSITORY) private readonly materials: MaterialRepository,
    @Inject(COMPOSITE_PRODUCT_REPOSITORY)
    private readonly compositeProducts: CompositeProductRepository,
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: UnitOfWork,
  ) {}

  async create(input: CreateSaleInput): Promise<SaleView> {
    if (input.items.length === 0) {
      throw new EmptySaleError('A Sale must have at least one item.');
    }

    const now = new Date();
    const saleId = randomUUID();
    const items = await this.resolveItems(saleId, input.items);

    const sale = new Sale({
      id: saleId,
      customerName: input.customerName,
      customerContact: input.customerContact,
      paymentMethod: input.paymentMethod,
      paymentStatus: 'PENDING',
      productionStatus: 'PENDING',
      createdAt: now,
      updatedAt: now,
    });

    await this.unitOfWork.runInTransaction(async (ctx) => {
      await ctx.sales.save(sale);
      await ctx.sales.saveItems(items);
    });

    return SaleViewMapper.toView(sale, items);
  }

  async findById(saleId: string): Promise<SaleView> {
    const sale = await this.findSaleOrThrow(saleId);
    const items = await this.sales.findItemsBySaleId(saleId);
    return SaleViewMapper.toView(sale, items);
  }

  /** Case 4: list filtered by either or both independent status axes. */
  async list(filter: SaleListFilter = {}): Promise<SaleView[]> {
    const sales = await this.sales.findAll();
    const views: SaleView[] = [];

    for (const sale of sales) {
      if (filter.paymentStatus !== undefined && sale.paymentStatus !== filter.paymentStatus) {
        continue;
      }
      if (
        filter.productionStatus !== undefined &&
        sale.productionStatus !== filter.productionStatus
      ) {
        continue;
      }

      const items = await this.sales.findItemsBySaleId(sale.id);
      views.push(SaleViewMapper.toView(sale, items));
    }

    return views;
  }

  /** Case 2: add a new line to a Sale still in PENDING production. */
  async addItem(saleId: string, input: CreateSaleItemInput): Promise<SaleView> {
    const sale = await this.findSaleOrThrow(saleId);
    this.assertEditable(sale);

    const [newItem] = await this.resolveItems(saleId, [input]);

    await this.unitOfWork.runInTransaction(async (ctx) => {
      await ctx.sales.saveItems([newItem]);
    });

    const items = await this.sales.findItemsBySaleId(saleId);
    return SaleViewMapper.toView(sale, items);
  }

  /**
   * Case 2: the only way to change which entity a line references — remove
   * it and add a fresh one, which gets its own new snapshot. See the
   * `SaleRepository.saveItems` docstring.
   */
  async removeItem(saleId: string, itemId: string): Promise<SaleView> {
    const sale = await this.findSaleOrThrow(saleId);
    this.assertEditable(sale);
    const item = await this.findItemOrThrow(saleId, itemId);

    await this.unitOfWork.runInTransaction(async (ctx) => {
      await ctx.sales.deleteItem(item.id);
    });

    const items = await this.sales.findItemsBySaleId(saleId);
    return SaleViewMapper.toView(sale, items);
  }

  /** Case 2: quantity is the only in-place edit a line supports — the snapshot never changes. */
  async updateItemQuantity(saleId: string, itemId: string, quantity: number): Promise<SaleView> {
    const sale = await this.findSaleOrThrow(saleId);
    this.assertEditable(sale);
    const item = await this.findItemOrThrow(saleId, itemId);
    const updatedItem = item.withQuantity(quantity);

    await this.unitOfWork.runInTransaction(async (ctx) => {
      await ctx.sales.saveItems([updatedItem]);
    });

    const items = await this.sales.findItemsBySaleId(saleId);
    return SaleViewMapper.toView(sale, items);
  }

  /** Case 2: customer/payment-method fields, while the Sale is still in PENDING production. */
  async updateDetails(saleId: string, input: UpdateSaleDetailsInput): Promise<SaleView> {
    const now = new Date();
    const sale = await this.findSaleOrThrow(saleId);
    this.assertEditable(sale);

    const changes: Parameters<Sale['update']>[0] = {};
    if (input.customerName !== undefined) changes.customerName = input.customerName;
    if (input.customerContact !== undefined) changes.customerContact = input.customerContact;
    if (input.paymentMethod !== undefined) changes.paymentMethod = input.paymentMethod;

    const updated = sale.update(changes, now);

    await this.unitOfWork.runInTransaction(async (ctx) => {
      await ctx.sales.save(updated);
    });

    const items = await this.sales.findItemsBySaleId(saleId);
    return SaleViewMapper.toView(updated, items);
  }

  /** Case 3: paymentStatus changes independently of productionStatus, no stock side effect. */
  async updatePaymentStatus(saleId: string, paymentStatus: PaymentStatus): Promise<SaleView> {
    const now = new Date();
    const sale = await this.findSaleOrThrow(saleId);
    const updated = sale.withPaymentStatus(paymentStatus, now);

    await this.unitOfWork.runInTransaction(async (ctx) => {
      await ctx.sales.save(updated);
    });

    const items = await this.sales.findItemsBySaleId(saleId);
    return SaleViewMapper.toView(updated, items);
  }

  /**
   * Case 3 + stock debit/reversal. Everything — reading the Sale's current
   * status, debiting or reversing every Material, and saving the new status
   * — runs inside a single `UnitOfWork` transaction, because the debit must
   * see the stock quantities as of right now, not as of an earlier read.
   */
  async updateProductionStatus(
    saleId: string,
    productionStatus: ProductionStatus,
  ): Promise<SaleView> {
    const now = new Date();

    return this.unitOfWork.runInTransaction(async (ctx) => {
      const sale = await ctx.sales.findById(saleId);

      if (!sale) {
        throw new SaleNotFoundError(`Sale ${saleId} was not found.`);
      }

      if (productionStatus !== sale.productionStatus) {
        if (productionStatus === 'ASSEMBLED') {
          // Debit happens only the FIRST time this Sale ever reaches
          // ASSEMBLED. A later re-arrival — a duplicate call, or
          // DELIVERED -> ASSEMBLED — must not debit stock twice;
          // `reverseStockDebit` clears the snapshots on the way back to
          // PENDING, so a genuine new assembly cycle debits again.
          const existingSnapshots = await ctx.sales.findStockMovementsBySaleId(saleId);
          if (existingSnapshots.length === 0) {
            await this.debitStock(ctx, saleId, now);
          }
        } else if (sale.productionStatus === 'ASSEMBLED' && productionStatus === 'PENDING') {
          await this.reverseStockDebit(ctx, saleId, now);
        }
      }

      const updated = sale.withProductionStatus(productionStatus, now);
      await ctx.sales.save(updated);

      const items = await ctx.sales.findItemsBySaleId(saleId);
      return SaleViewMapper.toView(updated, items);
    });
  }

  /** Case 5: aggregated shopping list across a set of selected Sales. */
  async getShoppingList(saleIds: string[]): Promise<ShoppingListLineView[]> {
    const itemsPerSale = await Promise.all(
      saleIds.map((saleId) => this.sales.findItemsBySaleId(saleId)),
    );
    const items = itemsPerSale.flat();
    const need = await this.resolveMaterialNeed(this.compositeProducts, items);

    const lines: ShortageLine[] = [];
    const materialsById = new Map<string, Material>();

    for (const [materialId, needed] of need) {
      const material = await this.materials.findById(materialId);
      if (!material) {
        continue;
      }
      materialsById.set(materialId, material);
      lines.push({ materialId, needed, stockQuantity: material.stockQuantity });
    }

    return calculateShortage(lines).map((result) => {
      const material = this.materialOrThrow(materialsById, result.materialId);

      return {
        materialId: result.materialId,
        materialName: material.name,
        needed: result.needed,
        stockQuantity: result.stockQuantity,
        shortage: result.shortage,
        // A shopping list of bare numbers is unusable: 400 of flour is 400 g,
        // 2 of egg boxes is 2 boxes.
        consumptionUnit: material.consumptionUnit,
        consumptionUnitSymbol: consumptionUnitSymbol(material.consumptionUnit),
      };
    });
  }

  /**
   * `need(material) = Σ (bomItem.quantity × saleItem.quantity) + avulso`,
   * resolved against real repositories and handed to the pure
   * `calculateMaterialNeed`. Takes a `CompositeProductRepository`
   * parameter so it works both inside a transaction (`ctx.compositeProducts`,
   * for the stock debit) and outside one (`this.compositeProducts`, for the
   * read-only shopping list).
   */
  private async resolveMaterialNeed(
    compositeProducts: CompositeProductRepository,
    items: readonly SaleItem[],
  ): Promise<Map<string, number>> {
    const compositeProductIds = [
      ...new Set(
        items
          .filter((item) => item.compositeProductId !== null)
          .map((item) => item.compositeProductId as string),
      ),
    ];

    const bomByCompositeProductId = new Map<string, BomNeedLine[]>();
    for (const productId of compositeProductIds) {
      const bom = await compositeProducts.findBillOfMaterials(productId);
      bomByCompositeProductId.set(
        productId,
        (bom?.items ?? []).map((item) => ({
          materialId: item.materialId,
          quantity: item.quantity,
        })),
      );
    }

    const needInputs: SaleItemNeedInput[] = items.map((item) => ({
      compositeProductId: item.compositeProductId,
      materialId: item.materialId,
      quantity: item.quantity,
    }));

    return calculateMaterialNeed(needInputs, bomByCompositeProductId);
  }

  /**
   * `debited(material) = min(need, stockQuantity)`, never negative. Runs
   * entirely against `ctx`, inside the caller's transaction: reading the
   * current `stockQuantity` here, right before writing it back, is what
   * makes the debit correct under concurrent sales.
   */
  private async debitStock(ctx: RepositoryContext, saleId: string, now: Date): Promise<void> {
    const items = await ctx.sales.findItemsBySaleId(saleId);
    const need = await this.resolveMaterialNeed(ctx.compositeProducts, items);
    const snapshots: StockMovementSnapshot[] = [];

    for (const [materialId, needed] of need) {
      const material = await ctx.materials.findById(materialId);
      if (!material) {
        continue;
      }

      const [{ debited }] = calculateStockDebit([
        { materialId, needed, stockQuantity: material.stockQuantity },
      ]);

      if (debited <= 0) {
        continue;
      }

      await ctx.materials.save(material.withStockQuantity(material.stockQuantity - debited, now));
      snapshots.push(
        new StockMovementSnapshot({
          id: randomUUID(),
          saleId,
          materialId,
          quantityDebited: debited,
          createdAt: now,
        }),
      );
    }

    if (snapshots.length > 0) {
      await ctx.sales.saveStockMovements(snapshots);
    }
  }

  /**
   * Reversal replays the `StockMovementSnapshot` exactly — it NEVER
   * recalculates the original need. Recalculating would manufacture stock
   * that never existed wherever a Material was zeroed during the debit.
   */
  private async reverseStockDebit(
    ctx: RepositoryContext,
    saleId: string,
    now: Date,
  ): Promise<void> {
    const snapshots = await ctx.sales.findStockMovementsBySaleId(saleId);

    for (const snapshot of snapshots) {
      const material = await ctx.materials.findById(snapshot.materialId);
      if (!material) {
        continue;
      }

      await ctx.materials.save(
        material.withStockQuantity(material.stockQuantity + snapshot.quantityDebited, now),
      );
    }

    await ctx.sales.deleteStockMovementsBySaleId(saleId);
  }

  /**
   * Resolves and prices every input line, freezing each price as the pair
   * `priceBasisAmount` / `priceBasisQuantity` rather than as a price per
   * unit — never recomputed on a later read.
   *
   * A CompositeProduct line takes its current `finalPrice` (materials cost +
   * fixed cost, marked up, unless overridden by `manualPrice`) over a basis
   * quantity of 1. A loose-Material ("avulso") line takes the whole
   * package's cost marked up by the margin given for this sale, over the
   * `packageQuantity` that package holds: the seller sets the margin on what
   * they sell, exactly as they do for a composite product, and the package
   * price stays undivided so that selling 120 g of a 1 kg bag costs what it
   * should.
   */
  private async resolveItems(
    saleId: string,
    inputs: readonly CreateSaleItemInput[],
  ): Promise<SaleItem[]> {
    for (const input of inputs) {
      const hasProduct = input.compositeProductId !== undefined;
      const hasMaterial = input.materialId !== undefined;
      if (hasProduct === hasMaterial) {
        throw new InvalidSaleError(
          'Each Sale item must reference exactly one of compositeProductId or materialId.',
        );
      }

      // Selling an input at cost is allowed; arriving at cost by omission is
      // not. Nothing downstream can tell a deliberate zero margin from a
      // margin nobody was asked for, so the choice is demanded here.
      if (hasMaterial && input.marginPercent === undefined) {
        throw new MissingLooseMaterialMarginError(
          `Sale item for Material ${input.materialId as string} requires an explicit marginPercent. Send 0 to sell at cost.`,
        );
      }

      // A CompositeProduct is priced by its own margin, already baked into
      // `finalPrice`. Accepting a second one here and ignoring it would read
      // as if it had been applied.
      if (hasProduct && input.marginPercent !== undefined) {
        throw new UnexpectedMarginError(
          `Sale item for CompositeProduct ${input.compositeProductId as string} must not carry a marginPercent: a CompositeProduct is sold at its own finalPrice.`,
        );
      }
    }

    const compositeProductIds = [
      ...new Set(
        inputs.flatMap((input) => (input.compositeProductId ? [input.compositeProductId] : [])),
      ),
    ];
    const materialIds = [
      ...new Set(inputs.flatMap((input) => (input.materialId ? [input.materialId] : []))),
    ];

    const compositeProductsById = new Map<string, CompositeProduct>();
    const finalPriceByCompositeProductId = new Map<string, Money>();

    for (const productId of compositeProductIds) {
      const product = await this.compositeProducts.findById(productId);
      if (!product) {
        throw new UnknownCompositeProductReferenceError(
          `SaleItem references CompositeProduct ${productId}, which does not exist.`,
        );
      }
      if (!product.isActive) {
        throw new DiscontinuedCompositeProductReferenceError(
          `SaleItem references CompositeProduct ${productId} ("${product.name}"), which is discontinued.`,
        );
      }
      compositeProductsById.set(productId, product);

      const bom = await this.compositeProducts.findBillOfMaterials(productId);
      const bomMaterialsById = await this.loadMaterialsById(
        (bom?.items ?? []).map((item) => item.materialId),
      );
      const materialsCost = calculateMaterialsCost(
        (bom?.items ?? []).map((item) => {
          const material = this.materialOrThrow(bomMaterialsById, item.materialId);

          return {
            quantity: item.quantity,
            packageCost: material.packageCost,
            packageQuantity: material.packageQuantity,
          };
        }),
      );
      const totalCost = calculateTotalCost(materialsCost, product.fixedOperationalCost);
      const suggestedPrice = calculateSuggestedPrice(totalCost, product.profitMargin);
      finalPriceByCompositeProductId.set(
        productId,
        calculateFinalPrice(suggestedPrice, product.manualPrice),
      );
    }

    const materialsById = await this.loadMaterialsById(materialIds);
    for (const material of materialsById.values()) {
      if (!material.isActive) {
        throw new DiscontinuedMaterialReferenceError(
          `SaleItem references Material ${material.id} ("${material.name}"), which is discontinued.`,
        );
      }
    }
    for (const materialId of materialIds) {
      if (!materialsById.has(materialId)) {
        throw new UnknownMaterialReferenceError(
          `SaleItem references Material ${materialId}, which does not exist.`,
        );
      }
    }

    return inputs.map((input) => {
      if (input.compositeProductId !== undefined) {
        const product = compositeProductsById.get(input.compositeProductId) as CompositeProduct;
        return new SaleItem({
          id: randomUUID(),
          saleId,
          compositeProductId: input.compositeProductId,
          materialId: null,
          quantity: input.quantity,
          itemNameSnapshot: product.name,
          // A product is sold by the piece, so the basis is one piece: the
          // frozen finalPrice over a quantity of 1.
          priceBasisAmount: finalPriceByCompositeProductId.get(input.compositeProductId) as Money,
          priceBasisQuantity: 1,
        });
      }

      const material = this.materialOrThrow(materialsById, input.materialId as string);
      return new SaleItem({
        id: randomUUID(),
        saleId,
        compositeProductId: null,
        materialId: input.materialId as string,
        quantity: input.quantity,
        itemNameSnapshot: material.name,
        // The whole package's marked-up price over what the package holds.
        // Kept as a fraction on purpose: the price of a single gram does not
        // fit in whole cents, so the division waits for `lineTotal`.
        priceBasisAmount: calculateLooseMaterialPriceBasis(
          material.packageCost,
          input.marginPercent as number,
        ),
        priceBasisQuantity: material.packageQuantity,
      });
    });
  }

  private async loadMaterialsById(materialIds: readonly string[]): Promise<Map<string, Material>> {
    const uniqueIds = [...new Set(materialIds)];
    const materialsById = new Map<string, Material>();

    for (const id of uniqueIds) {
      const material = await this.materials.findById(id);
      if (material) {
        materialsById.set(id, material);
      }
    }

    return materialsById;
  }

  private materialOrThrow(
    materialsById: ReadonlyMap<string, Material>,
    materialId: string,
  ): Material {
    const material = materialsById.get(materialId);

    if (!material) {
      throw new UnknownMaterialReferenceError(
        `SaleItem references Material ${materialId}, which does not exist.`,
      );
    }

    return material;
  }

  private async findSaleOrThrow(saleId: string): Promise<Sale> {
    const sale = await this.sales.findById(saleId);

    if (!sale) {
      throw new SaleNotFoundError(`Sale ${saleId} was not found.`);
    }

    return sale;
  }

  private async findItemOrThrow(saleId: string, itemId: string): Promise<SaleItem> {
    const items = await this.sales.findItemsBySaleId(saleId);
    const item = items.find((candidate) => candidate.id === itemId);

    if (!item) {
      throw new SaleItemNotFoundError(`SaleItem ${itemId} was not found on Sale ${saleId}.`);
    }

    return item;
  }

  private assertEditable(sale: Sale): void {
    if (sale.productionStatus !== 'PENDING') {
      throw new SaleNotEditableError(
        `Sale ${sale.id} cannot be edited: productionStatus is ${sale.productionStatus}, only PENDING sales can be edited.`,
      );
    }
  }
}
