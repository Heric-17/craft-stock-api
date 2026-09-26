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
import type { Material } from '../../../materials/domain/material.entity';
import {
  MATERIAL_REPOSITORY,
  type MaterialRepository,
} from '../../../materials/domain/repositories/material.repository';
import { BillOfMaterials } from '../../domain/bill-of-materials.entity';
import { BomItem } from '../../domain/bom-item.entity';
import {
  CompositeProduct,
  type CompositeProductProps,
} from '../../domain/composite-product.entity';
import {
  CompositeProductNotFoundError,
  InactiveMaterialReferenceError,
  UnknownMaterialReferenceError,
} from '../../domain/composite-product.error';
import {
  COMPOSITE_PRODUCT_REPOSITORY,
  type CompositeProductRepository,
} from '../../domain/repositories/composite-product.repository';
import type {
  BomItemInput,
  CompositeProductView,
  CreateCompositeProductInput,
  UpdateCompositeProductInput,
} from '../dto/composite-products.dto';
import { CompositeProductViewMapper } from '../mappers/composite-product-view.mapper';

@Injectable()
export class CompositeProductsService {
  constructor(
    @Inject(COMPOSITE_PRODUCT_REPOSITORY)
    private readonly compositeProducts: CompositeProductRepository,
    @Inject(MATERIAL_REPOSITORY) private readonly materials: MaterialRepository,
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: UnitOfWork,
    @Inject(STORAGE_PROVIDER_FACTORY)
    private readonly storageProviderFactory: StorageProviderFactory,
  ) {}

  async create(input: CreateCompositeProductInput): Promise<CompositeProductView> {
    const now = new Date();
    const productId = randomUUID();

    const product = new CompositeProduct({
      id: productId,
      name: input.name,
      description: input.description,
      imageUrl: null,
      fixedOperationalCost: Money.fromDecimalString(input.fixedOperationalCost),
      profitMargin: input.profitMargin,
      manualPrice: input.manualPrice ? Money.fromDecimalString(input.manualPrice) : null,
      discontinuedAt: null,
      createdAt: now,
      updatedAt: now,
    });

    const materialsById = await this.loadMaterialsOrThrow(
      input.billOfMaterials.map((item) => item.materialId),
    );
    this.assertMaterialsActive(materialsById);
    const billOfMaterials = this.buildBillOfMaterials(
      randomUUID(),
      productId,
      input.billOfMaterials,
    );

    await this.unitOfWork.runInTransaction(async (ctx) => {
      await ctx.compositeProducts.save(product);
      await ctx.compositeProducts.saveBillOfMaterials(billOfMaterials);
    });

    return CompositeProductViewMapper.toView(product, billOfMaterials, materialsById);
  }

  async update(
    productId: string,
    input: UpdateCompositeProductInput,
  ): Promise<CompositeProductView> {
    const now = new Date();
    const current = await this.findProductOrThrow(productId);

    const changes: Partial<Omit<CompositeProductProps, 'id' | 'createdAt'>> = {};
    if (input.name !== undefined) changes.name = input.name;
    if (input.description !== undefined) changes.description = input.description;
    if (input.fixedOperationalCost !== undefined) {
      changes.fixedOperationalCost = Money.fromDecimalString(input.fixedOperationalCost);
    }
    if (input.profitMargin !== undefined) changes.profitMargin = input.profitMargin;
    if (input.manualPrice !== undefined) {
      changes.manualPrice =
        input.manualPrice === null ? null : Money.fromDecimalString(input.manualPrice);
    }

    const updated = current.update(changes, now);

    let materialsById: ReadonlyMap<string, Material>;
    let billOfMaterials: BillOfMaterials;

    if (input.billOfMaterials !== undefined) {
      materialsById = await this.loadMaterialsOrThrow(
        input.billOfMaterials.map((item) => item.materialId),
      );
      this.assertMaterialsActive(materialsById);
      const currentBom = await this.compositeProducts.findBillOfMaterials(productId);
      billOfMaterials = this.buildBillOfMaterials(
        currentBom?.id ?? randomUUID(),
        productId,
        input.billOfMaterials,
      );
    } else {
      billOfMaterials = await this.findBillOfMaterialsOrThrow(productId);
      materialsById = await this.loadMaterialsOrThrow(
        billOfMaterials.items.map((item) => item.materialId),
      );
    }

    await this.unitOfWork.runInTransaction(async (ctx) => {
      await ctx.compositeProducts.save(updated);

      if (input.billOfMaterials !== undefined) {
        await ctx.compositeProducts.saveBillOfMaterials(billOfMaterials);
      }
    });

    return CompositeProductViewMapper.toView(updated, billOfMaterials, materialsById);
  }

  async findById(productId: string): Promise<CompositeProductView> {
    const product = await this.findProductOrThrow(productId);
    const billOfMaterials = await this.findBillOfMaterialsOrThrow(productId);
    const materialsById = await this.loadMaterialsOrThrow(
      billOfMaterials.items.map((item) => item.materialId),
    );

    return CompositeProductViewMapper.toView(product, billOfMaterials, materialsById);
  }

  async list(includeDiscontinued = false): Promise<CompositeProductView[]> {
    const products = await this.compositeProducts.findAll();
    const allMaterials = await this.materials.findAll();
    const materialsById = new Map(allMaterials.map((material) => [material.id, material]));

    const views: CompositeProductView[] = [];

    for (const product of products) {
      if (!includeDiscontinued && !product.isActive) {
        continue;
      }

      const billOfMaterials = await this.findBillOfMaterialsOrThrow(product.id);
      views.push(CompositeProductViewMapper.toView(product, billOfMaterials, materialsById));
    }

    return views;
  }

  async delete(productId: string): Promise<void> {
    await this.findProductOrThrow(productId);
    const referenceCount = await this.compositeProducts.countReferences(productId);

    if (referenceCount > 0) {
      throw new EntityInUseError('CompositeProduct', productId, referenceCount);
    }

    await this.unitOfWork.runInTransaction(async (ctx) => {
      await ctx.compositeProducts.delete(productId);
    });
  }

  async discontinue(productId: string): Promise<CompositeProductView> {
    const now = new Date();
    const current = await this.findProductOrThrow(productId);
    const updated = current.discontinue(now);

    await this.unitOfWork.runInTransaction(async (ctx) => {
      await ctx.compositeProducts.save(updated);
    });

    const billOfMaterials = await this.findBillOfMaterialsOrThrow(productId);
    const materialsById = await this.loadMaterialsOrThrow(
      billOfMaterials.items.map((item) => item.materialId),
    );

    return CompositeProductViewMapper.toView(updated, billOfMaterials, materialsById);
  }

  async reactivate(productId: string): Promise<CompositeProductView> {
    const now = new Date();
    const current = await this.findProductOrThrow(productId);
    const updated = current.reactivate(now);

    await this.unitOfWork.runInTransaction(async (ctx) => {
      await ctx.compositeProducts.save(updated);
    });

    const billOfMaterials = await this.findBillOfMaterialsOrThrow(productId);
    const materialsById = await this.loadMaterialsOrThrow(
      billOfMaterials.items.map((item) => item.materialId),
    );

    return CompositeProductViewMapper.toView(updated, billOfMaterials, materialsById);
  }

  /**
   * Uploads via the currently selected `StorageProvider` before touching the
   * database, and deletes the previous image only after the new key is
   * saved — so a failure at either step never leaves `imageUrl` pointing at
   * nothing, and at worst leaves an orphaned object in storage rather than a
   * dangling reference.
   */
  async setImage(productId: string, file: UploadableFile): Promise<CompositeProductView> {
    const now = new Date();
    const current = await this.findProductOrThrow(productId);
    const provider = this.storageProviderFactory.create();
    const newKey = await provider.upload(file);
    const updated = current.update({ imageUrl: newKey }, now);

    await this.unitOfWork.runInTransaction(async (ctx) => {
      await ctx.compositeProducts.save(updated);
    });

    if (current.imageUrl !== null) {
      await provider.delete(current.imageUrl);
    }

    const billOfMaterials = await this.findBillOfMaterialsOrThrow(productId);
    const materialsById = await this.loadMaterialsOrThrow(
      billOfMaterials.items.map((item) => item.materialId),
    );

    return CompositeProductViewMapper.toView(updated, billOfMaterials, materialsById);
  }

  async removeImage(productId: string): Promise<CompositeProductView> {
    const now = new Date();
    const current = await this.findProductOrThrow(productId);
    const updated = current.update({ imageUrl: null }, now);

    await this.unitOfWork.runInTransaction(async (ctx) => {
      await ctx.compositeProducts.save(updated);
    });

    if (current.imageUrl !== null) {
      await this.storageProviderFactory.create().delete(current.imageUrl);
    }

    const billOfMaterials = await this.findBillOfMaterialsOrThrow(productId);
    const materialsById = await this.loadMaterialsOrThrow(
      billOfMaterials.items.map((item) => item.materialId),
    );

    return CompositeProductViewMapper.toView(updated, billOfMaterials, materialsById);
  }

  private buildBillOfMaterials(
    id: string,
    compositeProductId: string,
    items: BomItemInput[],
  ): BillOfMaterials {
    return new BillOfMaterials({
      id,
      compositeProductId,
      items: items.map(
        (item) =>
          new BomItem({
            id: randomUUID(),
            billOfMaterialsId: id,
            materialId: item.materialId,
            quantity: item.quantity,
          }),
      ),
    });
  }

  private async loadMaterialsOrThrow(materialIds: string[]): Promise<Map<string, Material>> {
    const uniqueMaterialIds = [...new Set(materialIds)];
    const materialsById = new Map<string, Material>();

    for (const materialId of uniqueMaterialIds) {
      const material = await this.materials.findById(materialId);

      if (!material) {
        throw new UnknownMaterialReferenceError(
          `BillOfMaterials references Material ${materialId}, which does not exist.`,
        );
      }

      materialsById.set(materialId, material);
    }

    return materialsById;
  }

  private assertMaterialsActive(materialsById: ReadonlyMap<string, Material>): void {
    for (const material of materialsById.values()) {
      if (!material.isActive) {
        throw new InactiveMaterialReferenceError(
          `BillOfMaterials references Material ${material.id} ("${material.name}"), which is discontinued.`,
        );
      }
    }
  }

  private async findProductOrThrow(productId: string): Promise<CompositeProduct> {
    const product = await this.compositeProducts.findById(productId);

    if (!product) {
      throw new CompositeProductNotFoundError(`CompositeProduct ${productId} was not found.`);
    }

    return product;
  }

  private async findBillOfMaterialsOrThrow(productId: string): Promise<BillOfMaterials> {
    const billOfMaterials = await this.compositeProducts.findBillOfMaterials(productId);

    if (!billOfMaterials) {
      throw new CompositeProductNotFoundError(
        `CompositeProduct ${productId} has no BillOfMaterials.`,
      );
    }

    return billOfMaterials;
  }
}
