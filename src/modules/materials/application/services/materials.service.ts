import { randomUUID } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';

import { EntityInUseError } from '../../../../shared/domain/errors/entity-in-use.error';
import { Money } from '../../../../shared/domain/money/money';
import { UNIT_OF_WORK, type UnitOfWork } from '../../../../shared/domain/persistence/unit-of-work';
import { Material } from '../../domain/material.entity';
import { MaterialPriceHistory } from '../../domain/material-price-history.entity';
import { InvalidStockEntryError, MaterialNotFoundError } from '../../domain/material.error';
import {
  MATERIAL_REPOSITORY,
  type MaterialRepository,
} from '../../domain/repositories/material.repository';
import type {
  CreateMaterialInput,
  MaterialPriceHistoryView,
  MaterialView,
  StockEntryInput,
  UpdateMaterialInput,
} from '../dto/materials.dto';
import { MaterialViewMapper } from '../mappers/material-view.mapper';
import { normalizeForSearch } from '../normalize-for-search';

@Injectable()
export class MaterialsService {
  constructor(
    @Inject(MATERIAL_REPOSITORY) private readonly materials: MaterialRepository,
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: UnitOfWork,
  ) {}

  async create(input: CreateMaterialInput): Promise<MaterialView> {
    const now = new Date();
    const packageCost = Money.fromDecimalString(input.packageCost);

    const material = new Material({
      id: randomUUID(),
      name: input.name,
      description: input.description,
      imageUrl: input.imageUrl,
      packageCost,
      packageQuantity: input.packageQuantity,
      stockQuantity: input.stockQuantity,
      minimumStockAlert: input.minimumStockAlert,
      discontinuedAt: null,
      createdAt: now,
      updatedAt: now,
    });

    const priceHistoryEntry = new MaterialPriceHistory({
      id: randomUUID(),
      materialId: material.id,
      previousValue: Money.zero(),
      newValue: packageCost,
      origin: 'CREATION',
      changedAt: now,
    });

    await this.unitOfWork.runInTransaction(async (ctx) => {
      await ctx.materials.save(material);
      await ctx.materials.addPriceHistoryEntry(priceHistoryEntry);
    });

    return MaterialViewMapper.toView(material);
  }

  async update(materialId: string, input: UpdateMaterialInput): Promise<MaterialView> {
    const now = new Date();
    const current = await this.findByIdOrThrow(materialId);

    const changes: Partial<{
      name: string;
      description: string | null;
      imageUrl: string | null;
      packageCost: Money;
      packageQuantity: number;
      minimumStockAlert: number;
    }> = {};

    if (input.name !== undefined) changes.name = input.name;
    if (input.description !== undefined) changes.description = input.description;
    if (input.imageUrl !== undefined) changes.imageUrl = input.imageUrl;
    if (input.packageQuantity !== undefined) changes.packageQuantity = input.packageQuantity;
    if (input.minimumStockAlert !== undefined) changes.minimumStockAlert = input.minimumStockAlert;

    let newPackageCost: Money | undefined;
    if (input.packageCost !== undefined) {
      newPackageCost = Money.fromDecimalString(input.packageCost);
      changes.packageCost = newPackageCost;
    }

    const updated = current.update(changes, now);
    const priceChanged =
      newPackageCost !== undefined && !newPackageCost.equals(current.packageCost);

    await this.unitOfWork.runInTransaction(async (ctx) => {
      await ctx.materials.save(updated);

      if (priceChanged) {
        await ctx.materials.addPriceHistoryEntry(
          new MaterialPriceHistory({
            id: randomUUID(),
            materialId: updated.id,
            previousValue: current.packageCost,
            newValue: updated.packageCost,
            origin: 'MANUAL_EDIT',
            changedAt: now,
          }),
        );
      }
    });

    return MaterialViewMapper.toView(updated);
  }

  /** Active Materials only by default — see CLAUDE.md section 9. */
  async list(includeDiscontinued = false): Promise<MaterialView[]> {
    const materials = await this.materials.findAll();

    return materials
      .filter((material) => includeDiscontinued || material.isActive)
      .map((material) => MaterialViewMapper.toView(material));
  }

  /** Active Materials only by default — see CLAUDE.md section 9. */
  async search(query: string, includeDiscontinued = false): Promise<MaterialView[]> {
    const normalizedQuery = normalizeForSearch(query);
    const materials = await this.materials.findAll();

    return materials
      .filter((material) => includeDiscontinued || material.isActive)
      .filter((material) => normalizeForSearch(material.name).includes(normalizedQuery))
      .map((material) => MaterialViewMapper.toView(material));
  }

  async registerStockEntry(materialId: string, input: StockEntryInput): Promise<MaterialView> {
    const now = new Date();
    const current = await this.findByIdOrThrow(materialId);
    const newStockQuantity = this.resolveNewStockQuantity(current.stockQuantity, input);

    let updated = current.withStockQuantity(newStockQuantity, now);
    let priceChanged = false;

    if (input.source === 'INVOICE_SYNC' && input.invoicePackageCost !== undefined) {
      const reportedPackageCost = Money.fromDecimalString(input.invoicePackageCost);
      updated = updated.receiveInvoicePackageCost(reportedPackageCost, now);
      priceChanged = !updated.packageCost.equals(current.packageCost);
    }

    await this.unitOfWork.runInTransaction(async (ctx) => {
      await ctx.materials.save(updated);

      if (priceChanged) {
        await ctx.materials.addPriceHistoryEntry(
          new MaterialPriceHistory({
            id: randomUUID(),
            materialId: updated.id,
            previousValue: current.packageCost,
            newValue: updated.packageCost,
            origin: 'INVOICE_SYNC',
            changedAt: now,
          }),
        );
      }
    });

    return MaterialViewMapper.toView(updated);
  }

  async getPriceHistory(materialId: string): Promise<MaterialPriceHistoryView[]> {
    await this.findByIdOrThrow(materialId);
    const entries = await this.materials.findPriceHistoryByMaterialId(materialId);
    return entries.map((entry) => MaterialViewMapper.toPriceHistoryView(entry));
  }

  /**
   * Physical delete — allowed only when nothing references this Material
   * (CLAUDE.md section 9). Otherwise throws `EntityInUseError`; the caller
   * should discontinue it instead.
   */
  async delete(materialId: string): Promise<void> {
    await this.findByIdOrThrow(materialId);
    const referenceCount = await this.materials.countReferences(materialId);

    if (referenceCount > 0) {
      throw new EntityInUseError('Material', materialId, referenceCount);
    }

    await this.unitOfWork.runInTransaction(async (ctx) => {
      await ctx.materials.delete(materialId);
    });
  }

  async discontinue(materialId: string): Promise<MaterialView> {
    const now = new Date();
    const current = await this.findByIdOrThrow(materialId);
    const updated = current.discontinue(now);

    await this.unitOfWork.runInTransaction(async (ctx) => {
      await ctx.materials.save(updated);
    });

    return MaterialViewMapper.toView(updated);
  }

  async reactivate(materialId: string): Promise<MaterialView> {
    const now = new Date();
    const current = await this.findByIdOrThrow(materialId);
    const updated = current.reactivate(now);

    await this.unitOfWork.runInTransaction(async (ctx) => {
      await ctx.materials.save(updated);
    });

    return MaterialViewMapper.toView(updated);
  }

  private resolveNewStockQuantity(currentQuantity: number, input: StockEntryInput): number {
    const { relativeIncrement, absoluteQuantity } = input;

    if (absoluteQuantity !== undefined && relativeIncrement === undefined) {
      return absoluteQuantity;
    }

    if (relativeIncrement !== undefined && absoluteQuantity === undefined) {
      return currentQuantity + relativeIncrement;
    }

    throw new InvalidStockEntryError(
      'A stock entry must provide exactly one of relativeIncrement or absoluteQuantity.',
    );
  }

  private async findByIdOrThrow(materialId: string): Promise<Material> {
    const material = await this.materials.findById(materialId);

    if (!material) {
      throw new MaterialNotFoundError(`Material ${materialId} was not found.`);
    }

    return material;
  }
}
