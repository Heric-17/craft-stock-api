import { randomUUID } from 'node:crypto';

import { Money } from '../../../../shared/domain/money/money';
import { InMemoryUnitOfWork } from '../../../../shared/infrastructure/persistence/in-memory-unit-of-work';
import type { RepositoryContext } from '../../../../shared/domain/persistence/unit-of-work';
import { BillOfMaterials } from '../../../composite-products/domain/bill-of-materials.entity';
import { BomItem } from '../../../composite-products/domain/bom-item.entity';
import { CompositeProduct } from '../../../composite-products/domain/composite-product.entity';
import { InMemoryCompositeProductRepository } from '../../../composite-products/infrastructure/persistence/in-memory-composite-product.repository';
import { InMemoryPendingInvoiceRepository } from '../../../invoices/infrastructure/persistence/in-memory-pending-invoice.repository';
import { Material } from '../../../materials/domain/material.entity';
import { InMemoryMaterialRepository } from '../../../materials/infrastructure/persistence/in-memory-material.repository';
import { InMemoryPurchaseRepository } from '../../../purchases/infrastructure/persistence/in-memory-purchase.repository';
import { InMemoryUserRepository } from '../../../users/infrastructure/persistence/in-memory-user.repository';
import {
  DiscontinuedMaterialReferenceError,
  EmptySaleError,
  MissingLooseMaterialMarginError,
  SaleNotEditableError,
  SaleNotFoundError,
  UnexpectedMarginError,
  UnknownMaterialReferenceError,
} from '../../domain/sale.error';
import { InMemorySaleRepository } from '../../infrastructure/persistence/in-memory-sale.repository';
import type { CreateSaleInput } from '../dto/sales.dto';
import { SalesService } from './sales.service';

function buildService(): {
  service: SalesService;
  materials: InMemoryMaterialRepository;
  compositeProducts: InMemoryCompositeProductRepository;
  sales: InMemorySaleRepository;
} {
  const materials = new InMemoryMaterialRepository();
  const compositeProducts = new InMemoryCompositeProductRepository();
  const sales = new InMemorySaleRepository();
  const context: RepositoryContext = {
    materials,
    compositeProducts,
    sales,
    purchases: new InMemoryPurchaseRepository(),
    pendingInvoices: new InMemoryPendingInvoiceRepository(),
    users: new InMemoryUserRepository(),
  };

  return {
    service: new SalesService(sales, materials, compositeProducts, new InMemoryUnitOfWork(context)),
    materials,
    compositeProducts,
    sales,
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
    // 1 kg bag of flour, consumed by the gram.
    consumptionUnit: 'GRAM',
    stockQuantity: 1000,
    minimumStockAlert: 100,
    discontinuedAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  });
}

function buildCompositeProductWithBom(
  compositeProducts: InMemoryCompositeProductRepository,
  material: Material,
  overrides: Partial<ConstructorParameters<typeof CompositeProduct>[0]> = {},
): CompositeProduct {
  const now = new Date('2026-01-01T00:00:00Z');
  const product = new CompositeProduct({
    id: randomUUID(),
    name: 'Bolo de cenoura',
    description: null,
    imageUrl: null,
    fixedOperationalCost: Money.fromDecimalString('2.50'),
    profitMargin: 35,
    manualPrice: null,
    discontinuedAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  });

  const bomId = randomUUID();
  const bom = new BillOfMaterials({
    id: bomId,
    compositeProductId: product.id,
    items: [
      new BomItem({
        id: randomUUID(),
        billOfMaterialsId: bomId,
        materialId: material.id,
        quantity: 120,
      }),
    ],
  });

  void compositeProducts.save(product);
  void compositeProducts.saveBillOfMaterials(bom);

  return product;
}

function buildCreateInput(overrides: Partial<CreateSaleInput> = {}): CreateSaleInput {
  return {
    customerName: 'Maria',
    customerContact: null,
    paymentMethod: 'PIX',
    items: [],
    ...overrides,
  };
}

describe('SalesService', () => {
  describe('create', () => {
    it('rejects a Sale with no items', async () => {
      const { service } = buildService();

      await expect(service.create(buildCreateInput({ items: [] }))).rejects.toThrow(EmptySaleError);
    });

    it('freezes a loose-Material ("avulso") line as the package price over the package quantity', async () => {
      const { service, materials } = buildService();
      const flour = buildMaterial({
        packageCost: Money.fromDecimalString('28.00'),
        packageQuantity: 1000,
      });
      await materials.save(flour);

      const sale = await service.create(
        buildCreateInput({ items: [{ materialId: flour.id, quantity: 120, marginPercent: 0 }] }),
      );

      expect(sale.items).toHaveLength(1);
      expect(sale.items[0].itemNameSnapshot).toBe('Farinha de trigo');
      // The whole package and what it holds, not R$ 0,03 per gram.
      expect(sale.items[0].priceBasisAmount).toBe('28.00');
      expect(sale.items[0].priceBasisQuantity).toBe(1000);
      expect(sale.items[0].unitPrice).toBe('0.0280');
      // 28.00 x 120 / 1000, and nothing else: R$ 3,60 here would mean the
      // per-unit price had been rounded before being multiplied.
      expect(sale.items[0].lineTotal).toBe('3.36');
      expect(sale.totalAmount).toBe('3.36');
    });

    it('applies the margin given for the sale to the whole package price', async () => {
      const { service, materials } = buildService();
      const flour = buildMaterial({
        packageCost: Money.fromDecimalString('28.00'),
        packageQuantity: 1000,
      });
      await materials.save(flour);

      const sale = await service.create(
        buildCreateInput({ items: [{ materialId: flour.id, quantity: 120, marginPercent: 50 }] }),
      );

      expect(sale.items[0].priceBasisAmount).toBe('42.00');
      expect(sale.items[0].lineTotal).toBe('5.04');
    });

    it('charges the whole amount when the unit price does not divide evenly', async () => {
      const { service, materials } = buildService();
      // R$ 10,00 for a package of 3: R$ 3,3333... each, which no per-unit
      // snapshot can hold. Selling all three must charge the R$ 10,00 paid.
      const eggs = buildMaterial({
        name: 'Ovo',
        packageCost: Money.fromDecimalString('10.00'),
        packageQuantity: 3,
        consumptionUnit: 'UNIT',
        stockQuantity: 3,
      });
      await materials.save(eggs);

      const sale = await service.create(
        buildCreateInput({ items: [{ materialId: eggs.id, quantity: 3, marginPercent: 0 }] }),
      );

      expect(sale.items[0].unitPrice).toBe('3.3333');
      expect(sale.items[0].lineTotal).toBe('10.00');
      expect(sale.totalAmount).toBe('10.00');
    });

    it('rejects a loose-Material line with no margin stated', async () => {
      const { service, materials } = buildService();
      const flour = buildMaterial();
      await materials.save(flour);

      // Selling at cost is allowed, but only on purpose: `marginPercent: 0`
      // says so, and an absent margin is not the same statement.
      await expect(
        service.create(buildCreateInput({ items: [{ materialId: flour.id, quantity: 120 }] })),
      ).rejects.toThrow(MissingLooseMaterialMarginError);
    });

    it('rejects a margin on a CompositeProduct line, which carries its own', async () => {
      const { service, materials, compositeProducts } = buildService();
      const flour = buildMaterial();
      await materials.save(flour);
      const product = buildCompositeProductWithBom(compositeProducts, flour);

      await expect(
        service.create(
          buildCreateInput({
            items: [{ compositeProductId: product.id, quantity: 1, marginPercent: 20 }],
          }),
        ),
      ).rejects.toThrow(UnexpectedMarginError);
    });

    it('freezes a CompositeProduct line at its computed finalPrice over a basis of one', async () => {
      const { service, materials, compositeProducts } = buildService();
      const flour = buildMaterial();
      await materials.save(flour);
      const product = buildCompositeProductWithBom(compositeProducts, flour);

      const sale = await service.create(
        buildCreateInput({ items: [{ compositeProductId: product.id, quantity: 2 }] }),
      );

      // materialsCost = 10.00 x 120 / 1000 = 1.20; totalCost = 1.20 + 2.50 = 3.70;
      // suggestedPrice = 3.70 x 1.35 = 5.00
      expect(sale.items[0].priceBasisAmount).toBe('5.00');
      // A product is sold by the piece, so the basis is one piece — which is
      // what keeps this line behaving exactly as it did before the pair.
      expect(sale.items[0].priceBasisQuantity).toBe(1);
      expect(sale.items[0].unitPrice).toBe('5.0000');
      expect(sale.items[0].lineTotal).toBe('10.00');
    });

    it('rejects an item referencing both a CompositeProduct and a Material', async () => {
      const { service } = buildService();

      await expect(
        service.create(
          buildCreateInput({ items: [{ compositeProductId: 'x', materialId: 'y', quantity: 1 }] }),
        ),
      ).rejects.toThrow();
    });

    it('rejects an item referencing a Material that does not exist', async () => {
      const { service } = buildService();

      await expect(
        service.create(buildCreateInput({ items: [{ materialId: 'missing', quantity: 1, marginPercent: 0 }] })),
      ).rejects.toThrow(UnknownMaterialReferenceError);
    });

    it('rejects an item referencing a discontinued Material', async () => {
      const { service, materials } = buildService();
      const flour = buildMaterial({ discontinuedAt: new Date('2026-01-10T00:00:00Z') });
      await materials.save(flour);

      await expect(
        service.create(buildCreateInput({ items: [{ materialId: flour.id, quantity: 1, marginPercent: 0 }] })),
      ).rejects.toThrow(DiscontinuedMaterialReferenceError);
    });
  });

  describe('editing (case 2)', () => {
    it('adds, changes the quantity of, and removes an item while PENDING', async () => {
      const { service, materials } = buildService();
      const flour = buildMaterial();
      const sugar = buildMaterial({ name: 'Açúcar' });
      await materials.save(flour);
      await materials.save(sugar);

      const created = await service.create(
        buildCreateInput({ items: [{ materialId: flour.id, quantity: 1, marginPercent: 0 }] }),
      );

      const withSecondItem = await service.addItem(created.id, {
        materialId: sugar.id,
        quantity: 2,
        marginPercent: 0,
      });
      expect(withSecondItem.items).toHaveLength(2);

      const flourLine = withSecondItem.items.find((item) => item.materialId === flour.id)!;
      const requantified = await service.updateItemQuantity(created.id, flourLine.id, 5);
      expect(requantified.items.find((item) => item.id === flourLine.id)?.quantity).toBe(5);

      const sugarLine = requantified.items.find((item) => item.materialId === sugar.id)!;
      const afterRemoval = await service.removeItem(created.id, sugarLine.id);
      expect(afterRemoval.items).toHaveLength(1);
      expect(afterRemoval.items[0].materialId).toBe(flour.id);
    });

    it('changes customer details while PENDING', async () => {
      const { service, materials } = buildService();
      const flour = buildMaterial();
      await materials.save(flour);
      const created = await service.create(
        buildCreateInput({ items: [{ materialId: flour.id, quantity: 1, marginPercent: 0 }] }),
      );

      const updated = await service.updateDetails(created.id, { customerName: 'Joana' });

      expect(updated.customerName).toBe('Joana');
    });

    it('rejects editing a Sale once it has left PENDING production', async () => {
      const { service, materials } = buildService();
      const flour = buildMaterial();
      await materials.save(flour);
      const created = await service.create(
        buildCreateInput({ items: [{ materialId: flour.id, quantity: 1, marginPercent: 0 }] }),
      );
      await service.updateProductionStatus(created.id, 'ASSEMBLED');

      await expect(
        service.addItem(created.id, { materialId: flour.id, quantity: 1, marginPercent: 0 }),
      ).rejects.toThrow(SaleNotEditableError);
      await expect(service.updateDetails(created.id, { customerName: 'Joana' })).rejects.toThrow(
        SaleNotEditableError,
      );
    });
  });

  describe('independent status axes (case 3)', () => {
    it('changes paymentStatus without touching productionStatus', async () => {
      const { service, materials } = buildService();
      const flour = buildMaterial();
      await materials.save(flour);
      const created = await service.create(
        buildCreateInput({ items: [{ materialId: flour.id, quantity: 1, marginPercent: 0 }] }),
      );

      const updated = await service.updatePaymentStatus(created.id, 'PAID');

      expect(updated.paymentStatus).toBe('PAID');
      expect(updated.productionStatus).toBe('PENDING');
    });
  });

  describe('stock debit on first ASSEMBLED', () => {
    it('debits exactly what was needed when stock is sufficient', async () => {
      const { service, materials } = buildService();
      const flour = buildMaterial({ stockQuantity: 1000 });
      await materials.save(flour);
      const created = await service.create(
        buildCreateInput({ items: [{ materialId: flour.id, quantity: 300, marginPercent: 0 }] }),
      );

      await service.updateProductionStatus(created.id, 'ASSEMBLED');

      const updatedFlour = await materials.findById(flour.id);
      expect(updatedFlour?.stockQuantity).toBe(700);
    });

    it('floors the Material at zero instead of going negative when stock is insufficient', async () => {
      const { service, materials, sales } = buildService();
      const flour = buildMaterial({ stockQuantity: 100 });
      await materials.save(flour);
      const created = await service.create(
        buildCreateInput({ items: [{ materialId: flour.id, quantity: 300, marginPercent: 0 }] }),
      );

      await service.updateProductionStatus(created.id, 'ASSEMBLED');

      const updatedFlour = await materials.findById(flour.id);
      expect(updatedFlour?.stockQuantity).toBe(0);

      const snapshots = await sales.findStockMovementsBySaleId(created.id);
      expect(snapshots).toHaveLength(1);
      expect(snapshots[0].quantityDebited).toBe(100);
    });

    it('does not debit twice on a repeated transition to ASSEMBLED', async () => {
      const { service, materials } = buildService();
      const flour = buildMaterial({ stockQuantity: 1000 });
      await materials.save(flour);
      const created = await service.create(
        buildCreateInput({ items: [{ materialId: flour.id, quantity: 300, marginPercent: 0 }] }),
      );

      await service.updateProductionStatus(created.id, 'ASSEMBLED');
      await service.updateProductionStatus(created.id, 'DELIVERED');
      await service.updateProductionStatus(created.id, 'ASSEMBLED');

      const updatedFlour = await materials.findById(flour.id);
      expect(updatedFlour?.stockQuantity).toBe(700);
    });
  });

  describe('reversal on ASSEMBLED -> PENDING', () => {
    it('returns exactly the debited quantity, not the original need, after a partial debit', async () => {
      const { service, materials, sales } = buildService();
      const flour = buildMaterial({ stockQuantity: 100 });
      await materials.save(flour);
      const created = await service.create(
        buildCreateInput({ items: [{ materialId: flour.id, quantity: 300, marginPercent: 0 }] }),
      );

      await service.updateProductionStatus(created.id, 'ASSEMBLED');
      await service.updateProductionStatus(created.id, 'PENDING');

      const restoredFlour = await materials.findById(flour.id);
      // Debited only 100 (all that was in stock) — reversal must give back
      // exactly that 100, never the original need of 300.
      expect(restoredFlour?.stockQuantity).toBe(100);

      const snapshots = await sales.findStockMovementsBySaleId(created.id);
      expect(snapshots).toHaveLength(0);
    });

    it('debits again on a fresh assembly cycle after a reversal', async () => {
      const { service, materials } = buildService();
      const flour = buildMaterial({ stockQuantity: 1000 });
      await materials.save(flour);
      const created = await service.create(
        buildCreateInput({ items: [{ materialId: flour.id, quantity: 300, marginPercent: 0 }] }),
      );

      await service.updateProductionStatus(created.id, 'ASSEMBLED');
      await service.updateProductionStatus(created.id, 'PENDING');
      await service.updateProductionStatus(created.id, 'ASSEMBLED');

      const updatedFlour = await materials.findById(flour.id);
      expect(updatedFlour?.stockQuantity).toBe(700);
    });
  });

  describe('list (case 4)', () => {
    it('filters by both independent status axes', async () => {
      const { service, materials } = buildService();
      const flour = buildMaterial();
      await materials.save(flour);
      const a = await service.create(
        buildCreateInput({ items: [{ materialId: flour.id, quantity: 1, marginPercent: 0 }] }),
      );
      const b = await service.create(
        buildCreateInput({ items: [{ materialId: flour.id, quantity: 1, marginPercent: 0 }] }),
      );
      await service.updatePaymentStatus(a.id, 'PAID');
      await service.updateProductionStatus(b.id, 'ASSEMBLED');

      const paid = await service.list({ paymentStatus: 'PAID' });
      expect(paid.map((sale) => sale.id)).toEqual([a.id]);

      const assembled = await service.list({ productionStatus: 'ASSEMBLED' });
      expect(assembled.map((sale) => sale.id)).toEqual([b.id]);
    });
  });

  describe('the frozen price basis, after the fact', () => {
    it('keeps both basis fields when the quantity of a line changes', async () => {
      const { service, materials } = buildService();
      const flour = buildMaterial({
        packageCost: Money.fromDecimalString('28.00'),
        packageQuantity: 1000,
      });
      await materials.save(flour);
      const created = await service.create(
        buildCreateInput({ items: [{ materialId: flour.id, quantity: 120, marginPercent: 50 }] }),
      );

      const updated = await service.updateItemQuantity(created.id, created.items[0].id, 240);

      expect(updated.items[0].priceBasisAmount).toBe('42.00');
      expect(updated.items[0].priceBasisQuantity).toBe(1000);
      // Only the derived total follows the new quantity.
      expect(updated.items[0].lineTotal).toBe('10.08');
    });

    it('is untouched by the referenced Material getting more expensive', async () => {
      const { service, materials } = buildService();
      const flour = buildMaterial({
        packageCost: Money.fromDecimalString('28.00'),
        packageQuantity: 1000,
      });
      await materials.save(flour);
      const created = await service.create(
        buildCreateInput({ items: [{ materialId: flour.id, quantity: 120, marginPercent: 0 }] }),
      );

      await materials.save(
        flour.update(
          { packageCost: Money.fromDecimalString('35.00') },
          new Date('2026-02-01T00:00:00Z'),
        ),
      );

      const reread = await service.findById(created.id);
      expect(reread.items[0].priceBasisAmount).toBe('28.00');
      expect(reread.items[0].lineTotal).toBe('3.36');
      expect(reread.totalAmount).toBe('3.36');
    });

    it('is untouched by the referenced CompositeProduct being repriced', async () => {
      const { service, materials, compositeProducts } = buildService();
      const flour = buildMaterial();
      await materials.save(flour);
      const product = buildCompositeProductWithBom(compositeProducts, flour);
      const created = await service.create(
        buildCreateInput({ items: [{ compositeProductId: product.id, quantity: 2 }] }),
      );

      await compositeProducts.save(
        product.update(
          { manualPrice: Money.fromDecimalString('99.00') },
          new Date('2026-02-01T00:00:00Z'),
        ),
      );

      const reread = await service.findById(created.id);
      expect(reread.items[0].priceBasisAmount).toBe('5.00');
      expect(reread.items[0].lineTotal).toBe('10.00');
    });
  });

  describe('getShoppingList (case 5)', () => {
    it('aggregates need across selected Sales and reports the shortage per Material', async () => {
      const { service, materials } = buildService();
      const flour = buildMaterial({ stockQuantity: 100 });
      await materials.save(flour);
      const a = await service.create(
        buildCreateInput({ items: [{ materialId: flour.id, quantity: 60, marginPercent: 0 }] }),
      );
      const b = await service.create(
        buildCreateInput({ items: [{ materialId: flour.id, quantity: 80, marginPercent: 0 }] }),
      );

      const list = await service.getShoppingList([a.id, b.id]);

      expect(list).toEqual([
        {
          materialId: flour.id,
          materialName: flour.name,
          needed: 140,
          stockQuantity: 100,
          shortage: 40,
          // Every quantity on the line is in the Material's own unit, so the
          // list says which one: 40 of flour is 40 g, not 40 bags.
          consumptionUnit: 'GRAM',
          consumptionUnitSymbol: 'g',
        },
      ]);
    });
  });

  describe('findById', () => {
    it('throws SaleNotFoundError for an unknown id', async () => {
      const { service } = buildService();

      await expect(service.findById('missing')).rejects.toThrow(SaleNotFoundError);
    });
  });
});
