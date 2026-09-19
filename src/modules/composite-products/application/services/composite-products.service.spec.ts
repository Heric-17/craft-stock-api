import { randomUUID } from 'node:crypto';

import { Money } from '../../../../shared/domain/money/money';
import { InMemoryUnitOfWork } from '../../../../shared/infrastructure/persistence/in-memory-unit-of-work';
import type { RepositoryContext } from '../../../../shared/domain/persistence/unit-of-work';
import { InMemoryPendingInvoiceRepository } from '../../../invoices/infrastructure/persistence/in-memory-pending-invoice.repository';
import { Material } from '../../../materials/domain/material.entity';
import { InMemoryMaterialRepository } from '../../../materials/infrastructure/persistence/in-memory-material.repository';
import { InMemoryPurchaseRepository } from '../../../purchases/infrastructure/persistence/in-memory-purchase.repository';
import { InMemorySaleRepository } from '../../../sales/infrastructure/persistence/in-memory-sale.repository';
import { InMemoryUserRepository } from '../../../users/infrastructure/persistence/in-memory-user.repository';
import { UnknownMaterialReferenceError } from '../../domain/composite-product.error';
import { InMemoryCompositeProductRepository } from '../../infrastructure/persistence/in-memory-composite-product.repository';
import type { CreateCompositeProductInput } from '../dto/composite-products.dto';
import { CompositeProductsService } from './composite-products.service';

function buildService(): {
  service: CompositeProductsService;
  materials: InMemoryMaterialRepository;
  compositeProducts: InMemoryCompositeProductRepository;
} {
  const materials = new InMemoryMaterialRepository();
  const compositeProducts = new InMemoryCompositeProductRepository();
  const context: RepositoryContext = {
    materials,
    compositeProducts,
    sales: new InMemorySaleRepository(),
    purchases: new InMemoryPurchaseRepository(),
    pendingInvoices: new InMemoryPendingInvoiceRepository(),
    users: new InMemoryUserRepository(),
  };

  return {
    service: new CompositeProductsService(
      compositeProducts,
      materials,
      new InMemoryUnitOfWork(context),
    ),
    materials,
    compositeProducts,
  };
}

function buildMaterial(
  overrides: Partial<ConstructorParameters<typeof Material>[0]> = {},
): Material {
  const now = new Date('2026-01-01T00:00:00Z');

  return new Material({
    id: randomUUID(),
    name: 'Farinha de trigo',
    description: null,
    imageUrl: null,
    packageCost: Money.fromDecimalString('10.00'),
    packageQuantity: 1000,
    stockQuantity: 1000,
    minimumStockAlert: 100,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  });
}

function buildCreateInput(
  overrides: Partial<CreateCompositeProductInput> = {},
): CreateCompositeProductInput {
  return {
    name: 'Bolo de cenoura',
    description: null,
    imageUrl: null,
    fixedOperationalCost: '2.50',
    profitMargin: 35,
    manualPrice: null,
    billOfMaterials: [],
    ...overrides,
  };
}

describe('CompositeProductsService', () => {
  describe('create', () => {
    it('creates a product with its BillOfMaterials and computes cost/price/capacity at read time', async () => {
      const { service, materials } = buildService();
      const flour = buildMaterial({
        packageCost: Money.fromDecimalString('10.00'),
        packageQuantity: 1000,
        stockQuantity: 1200,
      });
      await materials.save(flour);

      const created = await service.create(
        buildCreateInput({ billOfMaterials: [{ materialId: flour.id, quantity: 120 }] }),
      );

      expect(created.materialsCost).toBe('1.20');
      expect(created.totalCost).toBe('3.70');
      expect(created.suggestedPrice).toBe('5.00');
      expect(created.finalPrice).toBe('5.00');
      expect(created.productionCapacity).toBe(10);
      expect(created.bottleneck?.materialId).toBe(flour.id);
    });

    it('lets manualPrice override the suggestedPrice', async () => {
      const { service, materials } = buildService();
      const flour = buildMaterial();
      await materials.save(flour);

      const created = await service.create(
        buildCreateInput({
          billOfMaterials: [{ materialId: flour.id, quantity: 120 }],
          manualPrice: '3.00',
        }),
      );

      expect(created.finalPrice).toBe('3.00');
    });

    it('applies no markup when profitMargin is zero', async () => {
      const { service, materials } = buildService();
      const flour = buildMaterial();
      await materials.save(flour);

      const created = await service.create(
        buildCreateInput({
          billOfMaterials: [{ materialId: flour.id, quantity: 120 }],
          fixedOperationalCost: '0.00',
          profitMargin: 0,
        }),
      );

      expect(created.suggestedPrice).toBe(created.totalCost);
      expect(created.finalPrice).toBe(created.suggestedPrice);
    });

    it('rejects a BillOfMaterials item referencing a Material that does not exist', async () => {
      const { service } = buildService();

      await expect(
        service.create(
          buildCreateInput({ billOfMaterials: [{ materialId: 'missing', quantity: 1 }] }),
        ),
      ).rejects.toThrow(UnknownMaterialReferenceError);
    });
  });

  describe('findById', () => {
    it('reports zero capacity when a Material is used beyond its stock', async () => {
      const { service, materials } = buildService();
      const flour = buildMaterial({ stockQuantity: 50 });
      await materials.save(flour);

      const created = await service.create(
        buildCreateInput({ billOfMaterials: [{ materialId: flour.id, quantity: 120 }] }),
      );
      const view = await service.findById(created.id);

      expect(view.productionCapacity).toBe(0);
      expect(view.bottleneck?.materialId).toBe(flour.id);
    });
  });

  describe('list', () => {
    it('lists every product with its computed indicators', async () => {
      const { service, materials } = buildService();
      const flour = buildMaterial();
      await materials.save(flour);
      await service.create(
        buildCreateInput({ billOfMaterials: [{ materialId: flour.id, quantity: 120 }] }),
      );
      await service.create(buildCreateInput({ name: 'Cupcake', billOfMaterials: [] }));

      const views = await service.list();

      expect(views).toHaveLength(2);
    });
  });

  describe('delete', () => {
    it('removes the product', async () => {
      const { service, compositeProducts } = buildService();
      const created = await service.create(buildCreateInput());

      await service.delete(created.id);

      expect(await compositeProducts.findById(created.id)).toBeNull();
    });
  });
});
