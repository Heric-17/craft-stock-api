import { InMemoryCompositeProductRepository } from '../../../composite-products/infrastructure/persistence/in-memory-composite-product.repository';
import { InMemoryPendingInvoiceRepository } from '../../../invoices/infrastructure/persistence/in-memory-pending-invoice.repository';
import { InMemoryPurchaseRepository } from '../../../purchases/infrastructure/persistence/in-memory-purchase.repository';
import { InMemorySaleRepository } from '../../../sales/infrastructure/persistence/in-memory-sale.repository';
import { InMemoryUserRepository } from '../../../users/infrastructure/persistence/in-memory-user.repository';
import { InMemoryUnitOfWork } from '../../../../shared/infrastructure/persistence/in-memory-unit-of-work';
import type { RepositoryContext } from '../../../../shared/domain/persistence/unit-of-work';
import { InMemoryMaterialRepository } from '../../infrastructure/persistence/in-memory-material.repository';
import { InvalidStockEntryError, MaterialNotFoundError } from '../../domain/material.error';
import type { CreateMaterialInput } from '../dto/materials.dto';
import { MaterialsService } from './materials.service';

function buildService(): { service: MaterialsService; materials: InMemoryMaterialRepository } {
  const materials = new InMemoryMaterialRepository();
  const context: RepositoryContext = {
    materials,
    compositeProducts: new InMemoryCompositeProductRepository(),
    sales: new InMemorySaleRepository(),
    purchases: new InMemoryPurchaseRepository(),
    pendingInvoices: new InMemoryPendingInvoiceRepository(),
    users: new InMemoryUserRepository(),
  };

  return { service: new MaterialsService(materials, new InMemoryUnitOfWork(context)), materials };
}

function buildCreateInput(overrides: Partial<CreateMaterialInput> = {}): CreateMaterialInput {
  return {
    name: 'Farinha de trigo',
    description: null,
    imageUrl: null,
    packageCost: '10.00',
    packageQuantity: 1000,
    stockQuantity: 500,
    minimumStockAlert: 100,
    ...overrides,
  };
}

describe('MaterialsService', () => {
  describe('create', () => {
    it('creates the material and records a CREATION price history entry', async () => {
      const { service, materials } = buildService();

      const created = await service.create(buildCreateInput());

      const history = await materials.findPriceHistoryByMaterialId(created.id);
      expect(history).toHaveLength(1);
      expect(history[0].origin).toBe('CREATION');
      expect(history[0].previousValue.toDecimalString()).toBe('0.00');
      expect(history[0].newValue.toDecimalString()).toBe('10.00');
    });
  });

  describe('update', () => {
    it('records a MANUAL_EDIT price history entry when packageCost changes', async () => {
      const { service, materials } = buildService();
      const created = await service.create(buildCreateInput({ packageCost: '10.00' }));

      await service.update(created.id, { packageCost: '15.00' });

      const history = await materials.findPriceHistoryByMaterialId(created.id);
      expect(history).toHaveLength(2);
      expect(history[1].origin).toBe('MANUAL_EDIT');
      expect(history[1].previousValue.toDecimalString()).toBe('10.00');
      expect(history[1].newValue.toDecimalString()).toBe('15.00');
    });

    it('does not record a price history entry when packageCost is unchanged', async () => {
      const { service, materials } = buildService();
      const created = await service.create(buildCreateInput({ packageCost: '10.00' }));

      await service.update(created.id, { name: 'Novo nome' });

      const history = await materials.findPriceHistoryByMaterialId(created.id);
      expect(history).toHaveLength(1);
    });

    it('does not record a price history entry when packageCost is set to the same value', async () => {
      const { service, materials } = buildService();
      const created = await service.create(buildCreateInput({ packageCost: '10.00' }));

      await service.update(created.id, { packageCost: '10.00' });

      const history = await materials.findPriceHistoryByMaterialId(created.id);
      expect(history).toHaveLength(1);
    });

    it('throws when the material does not exist', async () => {
      const { service } = buildService();

      await expect(service.update('missing-id', { name: 'x' })).rejects.toThrow(
        MaterialNotFoundError,
      );
    });
  });

  describe('list', () => {
    it('computes unitCost and lowStock at read time without persisting them', async () => {
      const { service } = buildService();
      await service.create(
        buildCreateInput({
          packageCost: '10.00',
          packageQuantity: 1000,
          stockQuantity: 50,
          minimumStockAlert: 100,
        }),
      );

      const [view] = await service.list();

      expect(view.unitCost).toBe('0.01');
      expect(view.lowStock).toBe(true);
    });
  });

  describe('search', () => {
    it('finds materials by name ignoring accents and case', async () => {
      const { service } = buildService();
      await service.create(buildCreateInput({ name: 'Açúcar refinado' }));
      await service.create(buildCreateInput({ name: 'Farinha de trigo' }));

      const results = await service.search('acucar');

      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('Açúcar refinado');
    });

    it('matches regardless of case', async () => {
      const { service } = buildService();
      await service.create(buildCreateInput({ name: 'Chocolate em pó' }));

      const results = await service.search('CHOCOLATE');

      expect(results).toHaveLength(1);
    });
  });

  describe('registerStockEntry', () => {
    it('applies a relative increment', async () => {
      const { service } = buildService();
      const created = await service.create(buildCreateInput({ stockQuantity: 100 }));

      const updated = await service.registerStockEntry(created.id, {
        source: 'MANUAL',
        relativeIncrement: 50,
      });

      expect(updated.stockQuantity).toBe(150);
    });

    it('applies an absolute quantity', async () => {
      const { service } = buildService();
      const created = await service.create(buildCreateInput({ stockQuantity: 100 }));

      const updated = await service.registerStockEntry(created.id, {
        source: 'MANUAL',
        absoluteQuantity: 300,
      });

      expect(updated.stockQuantity).toBe(300);
    });

    it('rejects a command with neither relativeIncrement nor absoluteQuantity', async () => {
      const { service } = buildService();
      const created = await service.create(buildCreateInput());

      await expect(service.registerStockEntry(created.id, { source: 'MANUAL' })).rejects.toThrow(
        InvalidStockEntryError,
      );
    });

    it('rejects a command with both relativeIncrement and absoluteQuantity', async () => {
      const { service } = buildService();
      const created = await service.create(buildCreateInput());

      await expect(
        service.registerStockEntry(created.id, {
          source: 'MANUAL',
          relativeIncrement: 10,
          absoluteQuantity: 20,
        }),
      ).rejects.toThrow(InvalidStockEntryError);
    });

    describe('invoice sync price rule: packageCost only goes up', () => {
      it('updates packageCost and records INVOICE_SYNC history when the reported cost is higher', async () => {
        const { service, materials } = buildService();
        const created = await service.create(buildCreateInput({ packageCost: '10.00' }));

        const updated = await service.registerStockEntry(created.id, {
          source: 'INVOICE_SYNC',
          relativeIncrement: 100,
          invoicePackageCost: '12.00',
        });

        expect(updated.packageCost).toBe('12.00');

        const history = await materials.findPriceHistoryByMaterialId(created.id);
        expect(history).toHaveLength(2);
        expect(history[1].origin).toBe('INVOICE_SYNC');
        expect(history[1].previousValue.toDecimalString()).toBe('10.00');
        expect(history[1].newValue.toDecimalString()).toBe('12.00');
      });

      it('keeps packageCost and records no history when the reported cost is a promotional dip', async () => {
        const { service, materials } = buildService();
        const created = await service.create(buildCreateInput({ packageCost: '10.00' }));

        const updated = await service.registerStockEntry(created.id, {
          source: 'INVOICE_SYNC',
          relativeIncrement: 100,
          invoicePackageCost: '7.00',
        });

        expect(updated.packageCost).toBe('10.00');

        const history = await materials.findPriceHistoryByMaterialId(created.id);
        expect(history).toHaveLength(1);
        expect(history[0].origin).toBe('CREATION');
      });
    });

    it('throws when the material does not exist', async () => {
      const { service } = buildService();

      await expect(
        service.registerStockEntry('missing-id', { source: 'MANUAL', absoluteQuantity: 1 }),
      ).rejects.toThrow(MaterialNotFoundError);
    });
  });

  describe('getPriceHistory', () => {
    it('returns the recorded history for a material', async () => {
      const { service } = buildService();
      const created = await service.create(buildCreateInput({ packageCost: '10.00' }));
      await service.update(created.id, { packageCost: '11.00' });

      const history = await service.getPriceHistory(created.id);

      expect(history.map((entry) => entry.origin)).toEqual(['CREATION', 'MANUAL_EDIT']);
    });

    it('throws when the material does not exist', async () => {
      const { service } = buildService();

      await expect(service.getPriceHistory('missing-id')).rejects.toThrow(MaterialNotFoundError);
    });
  });
});
