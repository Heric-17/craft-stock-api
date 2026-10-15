import { randomUUID } from 'node:crypto';

import { Money } from '../../../../shared/domain/money/money';
import { InMemoryUnitOfWork } from '../../../../shared/infrastructure/persistence/in-memory-unit-of-work';
import type { RepositoryContext } from '../../../../shared/domain/persistence/unit-of-work';
import { StockMovementSnapshot } from '../../domain/stock-movement-snapshot.entity';
import type { ProductionStatus } from '../../domain/production-status.enum';
import { BillOfMaterials } from '../../../composite-products/domain/bill-of-materials.entity';
import { BomItem } from '../../../composite-products/domain/bom-item.entity';
import { CompositeProduct } from '../../../composite-products/domain/composite-product.entity';
import { InMemoryCompositeProductRepository } from '../../../composite-products/infrastructure/persistence/in-memory-composite-product.repository';
import { InMemoryPendingInvoiceRepository } from '../../../invoices/infrastructure/persistence/in-memory-pending-invoice.repository';
import { Material } from '../../../materials/domain/material.entity';
import { InMemoryMaterialRepository } from '../../../materials/infrastructure/persistence/in-memory-material.repository';
import { InMemoryStockLossRepository } from '../../../../modules/materials/infrastructure/persistence/in-memory-stock-loss.repository';
import { InMemoryPurchaseRepository } from '../../../purchases/infrastructure/persistence/in-memory-purchase.repository';
import { InMemoryRefreshTokenRepository } from '../../../auth/infrastructure/persistence/in-memory-refresh-token.repository';
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
    stockLosses: new InMemoryStockLossRepository(),
    refreshTokens: new InMemoryRefreshTokenRepository(),
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
    imageKey: null,
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
    imageKey: null,
    fixedOperationalCost: Money.fromDecimalString('2.50'),
    profitMarginBasisPoints: 3500,
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
        buildCreateInput({
          items: [{ materialId: flour.id, quantity: 120, marginBasisPoints: 0 }],
        }),
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
        buildCreateInput({
          items: [{ materialId: flour.id, quantity: 120, marginBasisPoints: 5000 }],
        }),
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
        buildCreateInput({ items: [{ materialId: eggs.id, quantity: 3, marginBasisPoints: 0 }] }),
      );

      expect(sale.items[0].unitPrice).toBe('3.3333');
      expect(sale.items[0].lineTotal).toBe('10.00');
      expect(sale.totalAmount).toBe('10.00');
    });

    it('rejects a loose-Material line with no margin stated', async () => {
      const { service, materials } = buildService();
      const flour = buildMaterial();
      await materials.save(flour);

      // Selling at cost is allowed, but only on purpose: `marginBasisPoints: 0`
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
            items: [{ compositeProductId: product.id, quantity: 1, marginBasisPoints: 2000 }],
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

    it('freezes the Material consumption unit on a loose-Material line, with its symbol', async () => {
      const { service, materials } = buildService();
      const flour = buildMaterial({ consumptionUnit: 'GRAM' });
      const milk = buildMaterial({ name: 'Leite', consumptionUnit: 'MILLILITER' });
      const ribbon = buildMaterial({ name: 'Fita', consumptionUnit: 'CENTIMETER' });
      const eggs = buildMaterial({ name: 'Ovo', consumptionUnit: 'UNIT' });
      for (const material of [flour, milk, ribbon, eggs]) {
        await materials.save(material);
      }

      const sale = await service.create(
        buildCreateInput({
          items: [flour, milk, ribbon, eggs].map((material) => ({
            materialId: material.id,
            quantity: 1,
            marginBasisPoints: 0,
          })),
        }),
      );

      const unitOf = (materialId: string) => {
        const line = sale.items.find((item) => item.materialId === materialId)!;
        return [line.consumptionUnit, line.consumptionUnitSymbol];
      };
      expect(unitOf(flour.id)).toEqual(['GRAM', 'g']);
      expect(unitOf(milk.id)).toEqual(['MILLILITER', 'ml']);
      expect(unitOf(ribbon.id)).toEqual(['CENTIMETER', 'cm']);
      expect(unitOf(eggs.id)).toEqual(['UNIT', 'un']);
    });

    it('freezes UNIT on a CompositeProduct line, whatever unit its materials use', async () => {
      const { service, materials, compositeProducts } = buildService();
      const flour = buildMaterial({ consumptionUnit: 'GRAM' });
      await materials.save(flour);
      const product = buildCompositeProductWithBom(compositeProducts, flour);

      const sale = await service.create(
        buildCreateInput({ items: [{ compositeProductId: product.id, quantity: 1 }] }),
      );

      expect(sale.items[0].consumptionUnit).toBe('UNIT');
      expect(sale.items[0].consumptionUnitSymbol).toBe('un');
    });

    it('keeps the unit a line was sold in after the Material unit is changed', async () => {
      const { service, materials } = buildService();
      // The unit is only changeable with no stock and no recipe line, which is
      // exactly the state in which a Material can still have past sales.
      const flour = buildMaterial({ consumptionUnit: 'GRAM', stockQuantity: 0 });
      await materials.save(flour);
      const created = await service.create(
        buildCreateInput({
          items: [{ materialId: flour.id, quantity: 120, marginBasisPoints: 0 }],
        }),
      );

      await materials.save(
        flour.changeConsumptionUnit('UNIT', { bomItemReferences: 0 }, new Date()),
      );
      expect((await materials.findById(flour.id))?.consumptionUnit).toBe('UNIT');

      const reread = await service.findById(created.id);
      expect(reread.items[0].consumptionUnit).toBe('GRAM');
      expect(reread.items[0].consumptionUnitSymbol).toBe('g');
      expect(reread.items[0].priceBasisQuantity).toBe(1000);

      const listed = await service.list({ limit: 10, offset: 0 });
      expect(listed.items[0].items[0].consumptionUnit).toBe('GRAM');

      // A line added now is sold in the unit the Material has now, while the
      // earlier one keeps its own.
      const withNewLine = await service.addItem(created.id, {
        materialId: flour.id,
        quantity: 2,
        marginBasisPoints: 0,
      });
      expect(withNewLine.items.map((item) => item.consumptionUnit).sort()).toEqual([
        'GRAM',
        'UNIT',
      ]);
    });

    it('carries the unit fields in every response that returns a Sale', async () => {
      const { service, materials } = buildService();
      const flour = buildMaterial({ consumptionUnit: 'GRAM' });
      const sugar = buildMaterial({ name: 'Açúcar', consumptionUnit: 'GRAM' });
      await materials.save(flour);
      await materials.save(sugar);

      const created = await service.create(
        buildCreateInput({
          items: [{ materialId: flour.id, quantity: 100, marginBasisPoints: 0 }],
        }),
      );
      const withSugar = await service.addItem(created.id, {
        materialId: sugar.id,
        quantity: 50,
        marginBasisPoints: 0,
      });
      const flourLine = withSugar.items.find((item) => item.materialId === flour.id)!;
      const sugarLine = withSugar.items.find((item) => item.materialId === sugar.id)!;

      const responses = {
        create: created,
        addItem: withSugar,
        updateItemQuantity: await service.updateItemQuantity(created.id, flourLine.id, 200),
        removeItem: await service.removeItem(created.id, sugarLine.id),
        updateDetails: await service.updateDetails(created.id, { customerName: 'Joana' }),
        findById: await service.findById(created.id),
        list: (await service.list({ limit: 10, offset: 0 })).items[0],
        paymentStatus: await service.updatePaymentStatus(created.id, 'PAID'),
        productionStatus: await service.updateProductionStatus(created.id, 'ASSEMBLED'),
      };

      for (const [name, response] of Object.entries(responses)) {
        expect(response.items.length).toBeGreaterThan(0);
        for (const item of response.items) {
          expect([name, item.consumptionUnit, item.consumptionUnitSymbol]).toEqual([
            name,
            'GRAM',
            'g',
          ]);
        }
      }
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
        service.create(
          buildCreateInput({
            items: [{ materialId: 'missing', quantity: 1, marginBasisPoints: 0 }],
          }),
        ),
      ).rejects.toThrow(UnknownMaterialReferenceError);
    });

    it('rejects an item referencing a discontinued Material', async () => {
      const { service, materials } = buildService();
      const flour = buildMaterial({ discontinuedAt: new Date('2026-01-10T00:00:00Z') });
      await materials.save(flour);

      await expect(
        service.create(
          buildCreateInput({
            items: [{ materialId: flour.id, quantity: 1, marginBasisPoints: 0 }],
          }),
        ),
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
        buildCreateInput({ items: [{ materialId: flour.id, quantity: 1, marginBasisPoints: 0 }] }),
      );

      const withSecondItem = await service.addItem(created.id, {
        materialId: sugar.id,
        quantity: 2,
        marginBasisPoints: 0,
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
        buildCreateInput({ items: [{ materialId: flour.id, quantity: 1, marginBasisPoints: 0 }] }),
      );

      const updated = await service.updateDetails(created.id, { customerName: 'Joana' });

      expect(updated.customerName).toBe('Joana');
    });

    it('rejects editing a Sale once it has left PENDING production', async () => {
      const { service, materials } = buildService();
      const flour = buildMaterial();
      await materials.save(flour);
      const created = await service.create(
        buildCreateInput({ items: [{ materialId: flour.id, quantity: 1, marginBasisPoints: 0 }] }),
      );
      await service.updateProductionStatus(created.id, 'ASSEMBLED');

      await expect(
        service.addItem(created.id, { materialId: flour.id, quantity: 1, marginBasisPoints: 0 }),
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
        buildCreateInput({ items: [{ materialId: flour.id, quantity: 1, marginBasisPoints: 0 }] }),
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
        buildCreateInput({
          items: [{ materialId: flour.id, quantity: 300, marginBasisPoints: 0 }],
        }),
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
        buildCreateInput({
          items: [{ materialId: flour.id, quantity: 300, marginBasisPoints: 0 }],
        }),
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
        buildCreateInput({
          items: [{ materialId: flour.id, quantity: 300, marginBasisPoints: 0 }],
        }),
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
        buildCreateInput({
          items: [{ materialId: flour.id, quantity: 300, marginBasisPoints: 0 }],
        }),
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
        buildCreateInput({
          items: [{ materialId: flour.id, quantity: 300, marginBasisPoints: 0 }],
        }),
      );

      await service.updateProductionStatus(created.id, 'ASSEMBLED');
      await service.updateProductionStatus(created.id, 'PENDING');
      await service.updateProductionStatus(created.id, 'ASSEMBLED');

      const updatedFlour = await materials.findById(flour.id);
      expect(updatedFlour?.stockQuantity).toBe(700);
    });
  });

  describe('stock follows the production axis, whatever the pair of states', () => {
    const STATUSES: ProductionStatus[] = ['PENDING', 'ASSEMBLED', 'DELIVERED'];

    /**
     * A one-line Sale of 300 g out of 1000 g, put straight into `status` with
     * the stock that status implies: PENDING has debited nothing, any other
     * status has debited the 300 and holds the snapshot that says so. Seeding
     * the state instead of walking to it keeps each transition test about that
     * transition alone.
     */
    async function seedSale(status: ProductionStatus, stockQuantity = 1000, need = 300) {
      const built = buildService();
      const flour = buildMaterial({ stockQuantity });
      await built.materials.save(flour);
      const created = await built.service.create(
        buildCreateInput({
          items: [{ materialId: flour.id, quantity: need, marginBasisPoints: 0 }],
        }),
      );

      if (status !== 'PENDING') {
        const debited = Math.min(need, stockQuantity);
        const sale = (await built.sales.findById(created.id))!;
        await built.sales.save(sale.withProductionStatus(status, new Date()));
        await built.materials.save(flour.withStockQuantity(stockQuantity - debited, new Date()));
        await built.sales.saveStockMovements([
          new StockMovementSnapshot({
            id: randomUUID(),
            saleId: created.id,
            materialId: flour.id,
            quantityDebited: debited,
            createdAt: new Date(),
          }),
        ]);
      }

      return { ...built, flour, saleId: created.id };
    }

    const transitions = STATUSES.flatMap((from) => STATUSES.map((to) => [from, to] as const));

    it.each(transitions)('%s -> %s leaves stock matching the target state', async (from, to) => {
      const { service, materials, sales, flour, saleId } = await seedSale(from);

      const updated = await service.updateProductionStatus(saleId, to);

      expect(updated.productionStatus).toBe(to);
      // PENDING = nothing debited; any other state = the 300 g debited.
      const expectedStock = to === 'PENDING' ? 1000 : 700;
      expect((await materials.findById(flour.id))?.stockQuantity).toBe(expectedStock);
      const snapshots = await sales.findStockMovementsBySaleId(saleId);
      expect(snapshots).toHaveLength(to === 'PENDING' ? 0 : 1);
      expect(snapshots.reduce((total, s) => total + s.quantityDebited, 0)).toBe(
        to === 'PENDING' ? 0 : 300,
      );
    });

    it('PENDING -> DELIVERED -> PENDING restores the stock', async () => {
      const { service, materials, flour, saleId } = await seedSale('PENDING');

      await service.updateProductionStatus(saleId, 'DELIVERED');
      expect((await materials.findById(flour.id))?.stockQuantity).toBe(700);

      await service.updateProductionStatus(saleId, 'PENDING');
      expect((await materials.findById(flour.id))?.stockQuantity).toBe(1000);
    });

    it('PENDING -> DELIVERED -> ASSEMBLED does not debit twice', async () => {
      const { service, materials, sales, flour, saleId } = await seedSale('PENDING');

      await service.updateProductionStatus(saleId, 'DELIVERED');
      // Debited on the way to DELIVERED, not late on the way to ASSEMBLED.
      expect((await materials.findById(flour.id))?.stockQuantity).toBe(700);

      await service.updateProductionStatus(saleId, 'ASSEMBLED');

      expect((await materials.findById(flour.id))?.stockQuantity).toBe(700);
      expect(await sales.findStockMovementsBySaleId(saleId)).toHaveLength(1);
    });

    it('debits the edited need, not the old one, when a Sale returned from DELIVERED is edited and assembled', async () => {
      const { service, materials, flour, saleId } = await seedSale('DELIVERED');

      await service.updateProductionStatus(saleId, 'PENDING');
      await service.addItem(saleId, { materialId: flour.id, quantity: 100, marginBasisPoints: 0 });
      await service.updateProductionStatus(saleId, 'ASSEMBLED');

      // Stock is back to 1000 after the return; the edited Sale needs 300 + 100.
      expect((await materials.findById(flour.id))?.stockQuantity).toBe(600);
    });

    it('PENDING -> ASSEMBLED -> DELIVERED -> PENDING returns what was debited, once', async () => {
      const { service, materials, sales, flour, saleId } = await seedSale('PENDING');

      await service.updateProductionStatus(saleId, 'ASSEMBLED');
      await service.updateProductionStatus(saleId, 'DELIVERED');
      expect((await materials.findById(flour.id))?.stockQuantity).toBe(700);

      await service.updateProductionStatus(saleId, 'PENDING');
      expect((await materials.findById(flour.id))?.stockQuantity).toBe(1000);
      expect(await sales.findStockMovementsBySaleId(saleId)).toHaveLength(0);
    });

    it('a second trip through DELIVERED debits again after the return to PENDING', async () => {
      const { service, materials, flour, saleId } = await seedSale('PENDING');

      await service.updateProductionStatus(saleId, 'DELIVERED');
      await service.updateProductionStatus(saleId, 'PENDING');
      await service.updateProductionStatus(saleId, 'DELIVERED');

      expect((await materials.findById(flour.id))?.stockQuantity).toBe(700);
    });

    it('returns only what a partial debit took when leaving DELIVERED for PENDING', async () => {
      // 100 g in stock for a 300 g need: the debit takes 100 and floors the
      // Material at zero. The return must give back 100, not 300.
      const { service, materials, sales, flour, saleId } = await seedSale('PENDING', 100);

      await service.updateProductionStatus(saleId, 'DELIVERED');
      expect((await materials.findById(flour.id))?.stockQuantity).toBe(0);
      const snapshots = await sales.findStockMovementsBySaleId(saleId);
      expect(snapshots.map((s) => s.quantityDebited)).toEqual([100]);

      await service.updateProductionStatus(saleId, 'PENDING');
      expect((await materials.findById(flour.id))?.stockQuantity).toBe(100);
      expect(await sales.findStockMovementsBySaleId(saleId)).toHaveLength(0);
    });

    it('returns only what a partial debit took across ASSEMBLED and DELIVERED', async () => {
      const { service, materials, flour, saleId } = await seedSale('PENDING', 100);

      await service.updateProductionStatus(saleId, 'ASSEMBLED');
      await service.updateProductionStatus(saleId, 'DELIVERED');
      await service.updateProductionStatus(saleId, 'ASSEMBLED');
      expect((await materials.findById(flour.id))?.stockQuantity).toBe(0);

      await service.updateProductionStatus(saleId, 'PENDING');
      expect((await materials.findById(flour.id))?.stockQuantity).toBe(100);
    });
  });

  describe('list (case 4)', () => {
    it('filters by both independent status axes', async () => {
      const { service, materials } = buildService();
      const flour = buildMaterial();
      await materials.save(flour);
      const a = await service.create(
        buildCreateInput({ items: [{ materialId: flour.id, quantity: 1, marginBasisPoints: 0 }] }),
      );
      const b = await service.create(
        buildCreateInput({ items: [{ materialId: flour.id, quantity: 1, marginBasisPoints: 0 }] }),
      );
      await service.updatePaymentStatus(a.id, 'PAID');
      await service.updateProductionStatus(b.id, 'ASSEMBLED');

      const paid = await service.list({ paymentStatus: 'PAID', limit: 20, offset: 0 });
      expect(paid.items.map((sale) => sale.id)).toEqual([a.id]);
      expect(paid.total).toBe(1);

      const assembled = await service.list({ productionStatus: 'ASSEMBLED', limit: 20, offset: 0 });
      expect(assembled.items.map((sale) => sale.id)).toEqual([b.id]);
      expect(assembled.total).toBe(1);
    });

    it('pages the history and reports the size of the whole filtered set', async () => {
      const { service, materials } = buildService();
      const flour = buildMaterial();
      await materials.save(flour);
      const ids: string[] = [];
      for (let index = 0; index < 5; index++) {
        const sale = await service.create(
          buildCreateInput({
            items: [{ materialId: flour.id, quantity: 1, marginBasisPoints: 0 }],
          }),
        );
        ids.push(sale.id);
      }

      const first = await service.list({ limit: 2, offset: 0 });
      const second = await service.list({ limit: 2, offset: 2 });
      const last = await service.list({ limit: 2, offset: 4 });
      const beyond = await service.list({ limit: 2, offset: 10 });

      expect(first.items).toHaveLength(2);
      expect(second.items).toHaveLength(2);
      expect(last.items).toHaveLength(1);
      expect(first.total).toBe(5);
      expect(beyond).toMatchObject({ items: [], total: 5, limit: 2, offset: 10 });

      // Every sale appears exactly once across the pages.
      const seen = [...first.items, ...second.items, ...last.items].map((sale) => sale.id);
      expect([...seen].sort()).toEqual([...ids].sort());
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
        buildCreateInput({
          items: [{ materialId: flour.id, quantity: 120, marginBasisPoints: 5000 }],
        }),
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
        buildCreateInput({
          items: [{ materialId: flour.id, quantity: 120, marginBasisPoints: 0 }],
        }),
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
        buildCreateInput({ items: [{ materialId: flour.id, quantity: 60, marginBasisPoints: 0 }] }),
      );
      const b = await service.create(
        buildCreateInput({ items: [{ materialId: flour.id, quantity: 80, marginBasisPoints: 0 }] }),
      );

      const list = await service.getShoppingList([a.id, b.id]);

      expect(list.lines).toEqual([
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
          // 40 g missing still means a whole 1 kg bag at 10.00.
          packagesToBuy: 1,
          estimatedCost: '10.00',
          estimateIssue: null,
        },
      ]);
      expect(list.estimatedTotal).toBe('10.00');
      expect(list.unestimatedLineCount).toBe(0);
    });

    it('buys whole packages and totals the estimate over every line', async () => {
      const { service, materials } = buildService();
      const flour = buildMaterial({ stockQuantity: 0 });
      const sugar = buildMaterial({
        name: 'Açúcar',
        packageCost: Money.fromDecimalString('4.50'),
        packageQuantity: 500,
        stockQuantity: 100,
      });
      await materials.save(flour);
      await materials.save(sugar);
      const sale = await service.create(
        buildCreateInput({
          items: [
            { materialId: flour.id, quantity: 1500, marginBasisPoints: 0 },
            { materialId: sugar.id, quantity: 600, marginBasisPoints: 0 },
          ],
        }),
      );

      const list = await service.getShoppingList([sale.id]);
      const byId = new Map(list.lines.map((line) => [line.materialId, line]));

      // 1500 g missing of 1 kg bags: 2 bags. 500 g missing of 500 g bags:
      // exactly 1 bag, not 2.
      expect(byId.get(flour.id)).toEqual(
        expect.objectContaining({ packagesToBuy: 2, estimatedCost: '20.00' }),
      );
      expect(byId.get(sugar.id)).toEqual(
        expect.objectContaining({ packagesToBuy: 1, estimatedCost: '4.50' }),
      );
      expect(list.estimatedTotal).toBe('24.50');
    });

    it('contributes zero for a Material that is not missing', async () => {
      const { service, materials } = buildService();
      const flour = buildMaterial({ stockQuantity: 1000 });
      await materials.save(flour);
      const sale = await service.create(
        buildCreateInput({
          items: [{ materialId: flour.id, quantity: 200, marginBasisPoints: 0 }],
        }),
      );

      const list = await service.getShoppingList([sale.id]);

      expect(list.lines[0]).toEqual(
        expect.objectContaining({ shortage: 0, packagesToBuy: 0, estimatedCost: '0.00' }),
      );
      expect(list.estimatedTotal).toBe('0.00');
      expect(list.unestimatedLineCount).toBe(0);
    });

    it('flags a Material with no package cost instead of estimating it as free', async () => {
      const { service, materials } = buildService();
      const flour = buildMaterial({ stockQuantity: 0, packageCost: Money.zero() });
      const sugar = buildMaterial({ name: 'Açúcar', stockQuantity: 0 });
      await materials.save(flour);
      await materials.save(sugar);
      const sale = await service.create(
        buildCreateInput({
          items: [
            { materialId: flour.id, quantity: 100, marginBasisPoints: 0 },
            { materialId: sugar.id, quantity: 100, marginBasisPoints: 0 },
          ],
        }),
      );

      const list = await service.getShoppingList([sale.id]);
      const unestimated = list.lines.find((line) => line.materialId === flour.id);

      expect(unestimated).toEqual(
        expect.objectContaining({
          packagesToBuy: 1,
          estimatedCost: null,
          estimateIssue: 'MISSING_PACKAGE_DATA',
        }),
      );
      // The total is only what could be estimated, and says that it is not all.
      expect(list.estimatedTotal).toBe('10.00');
      expect(list.unestimatedLineCount).toBe(1);
    });
  });

  describe('findById', () => {
    it('throws SaleNotFoundError for an unknown id', async () => {
      const { service } = buildService();

      await expect(service.findById('missing')).rejects.toThrow(SaleNotFoundError);
    });
  });
});
