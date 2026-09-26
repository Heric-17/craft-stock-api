import { randomUUID } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';

import { EntityInUseError } from '../../../../shared/domain/errors/entity-in-use.error';
import { Money } from '../../../../shared/domain/money/money';
import { UNIT_OF_WORK, type UnitOfWork } from '../../../../shared/domain/persistence/unit-of-work';
import {
  STORAGE_PROVIDER_FACTORY,
  type StorageProviderFactory,
  type UploadableFile,
} from '../../../../shared/domain/storage/storage-provider';
import type { ConsumptionUnit } from '../../domain/consumption-unit';
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
    @Inject(STORAGE_PROVIDER_FACTORY)
    private readonly storageProviderFactory: StorageProviderFactory,
  ) {}

  async create(input: CreateMaterialInput): Promise<MaterialView> {
    const now = new Date();
    const packageCost = Money.fromDecimalString(input.packageCost);

    const material = new Material({
      id: randomUUID(),
      name: input.name,
      description: input.description,
      imageUrl: null,
      packageCost,
      packageQuantity: input.packageQuantity,
      consumptionUnit: input.consumptionUnit,
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
      packageCost: Money;
      packageQuantity: number;
      minimumStockAlert: number;
    }> = {};

    if (input.name !== undefined) changes.name = input.name;
    if (input.description !== undefined) changes.description = input.description;
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

  /**
   * Switches the unit a `Material` is consumed by.
   *
   * A separate operation rather than a field of `update`, because it is not
   * an edit of a value: it reinterprets every quantity recorded against this
   * Material. The `BomItem` count is read here and the decision is the
   * entity's — this service does not re-state the rule.
   */
  async changeConsumptionUnit(
    materialId: string,
    consumptionUnit: ConsumptionUnit,
  ): Promise<MaterialView> {
    const now = new Date();
    const current = await this.findByIdOrThrow(materialId);
    const bomItemReferences = await this.materials.countBomItemReferences(materialId);
    const updated = current.changeConsumptionUnit(consumptionUnit, { bomItemReferences }, now);

    await this.unitOfWork.runInTransaction(async (ctx) => {
      await ctx.materials.save(updated);
    });

    return MaterialViewMapper.toView(updated);
  }

  async list(includeDiscontinued = false): Promise<MaterialView[]> {
    const materials = await this.materials.findAll();

    return materials
      .filter((material) => includeDiscontinued || material.isActive)
      .map((material) => MaterialViewMapper.toView(material));
  }

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

  /**
   * Uploads via the currently selected `StorageProvider` before touching the
   * database, and deletes the previous image only after the new key is
   * saved — so a failure at either step never leaves `imageUrl` pointing at
   * nothing, and at worst leaves an orphaned object in storage rather than a
   * dangling reference.
   */
  async setImage(materialId: string, file: UploadableFile): Promise<MaterialView> {
    const now = new Date();
    const current = await this.findByIdOrThrow(materialId);
    const provider = this.storageProviderFactory.create();
    const newKey = await provider.upload(file);
    const updated = current.update({ imageUrl: newKey }, now);

    await this.unitOfWork.runInTransaction(async (ctx) => {
      await ctx.materials.save(updated);
    });

    if (current.imageUrl !== null) {
      await provider.delete(current.imageUrl);
    }

    return MaterialViewMapper.toView(updated);
  }

  async removeImage(materialId: string): Promise<MaterialView> {
    const now = new Date();
    const current = await this.findByIdOrThrow(materialId);
    const updated = current.update({ imageUrl: null }, now);

    await this.unitOfWork.runInTransaction(async (ctx) => {
      await ctx.materials.save(updated);
    });

    if (current.imageUrl !== null) {
      await this.storageProviderFactory.create().delete(current.imageUrl);
    }

    return MaterialViewMapper.toView(updated);
  }

  async getPriceHistory(materialId: string): Promise<MaterialPriceHistoryView[]> {
    await this.findByIdOrThrow(materialId);
    const entries = await this.materials.findPriceHistoryByMaterialId(materialId);
    return entries.map((entry) => MaterialViewMapper.toPriceHistoryView(entry));
  }

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
