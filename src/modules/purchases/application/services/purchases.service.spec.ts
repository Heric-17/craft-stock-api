import { randomUUID } from 'node:crypto';

import { Money } from '../../../../shared/domain/money/money';
import type { RepositoryContext } from '../../../../shared/domain/persistence/unit-of-work';
import { InMemoryUnitOfWork } from '../../../../shared/infrastructure/persistence/in-memory-unit-of-work';
import { InMemoryCompositeProductRepository } from '../../../composite-products/infrastructure/persistence/in-memory-composite-product.repository';
import { InMemoryPendingInvoiceRepository } from '../../../invoices/infrastructure/persistence/in-memory-pending-invoice.repository';
import { Material } from '../../../materials/domain/material.entity';
import { InMemoryMaterialRepository } from '../../../materials/infrastructure/persistence/in-memory-material.repository';
import { InMemorySaleRepository } from '../../../sales/infrastructure/persistence/in-memory-sale.repository';
import { InMemoryUserRepository } from '../../../users/infrastructure/persistence/in-memory-user.repository';
import { InvalidPurchaseError, UnknownMaterialReferenceError } from '../../domain/purchase.error';
import { InMemoryPurchaseRepository } from '../../infrastructure/persistence/in-memory-purchase.repository';
import type { InvoiceLineInput, RegisterInvoicePurchaseInput } from '../dto/purchases.dto';
import { PurchasesService } from './purchases.service';

function buildService(): {
  service: PurchasesService;
  materials: InMemoryMaterialRepository;
  purchases: InMemoryPurchaseRepository;
} {
  const materials = new InMemoryMaterialRepository();
  const purchases = new InMemoryPurchaseRepository();
  const context: RepositoryContext = {
    materials,
    compositeProducts: new InMemoryCompositeProductRepository(),
    sales: new InMemorySaleRepository(),
    purchases,
    pendingInvoices: new InMemoryPendingInvoiceRepository(),
    users: new InMemoryUserRepository(),
  };

  return { service: new PurchasesService(new InMemoryUnitOfWork(context)), materials, purchases };
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

function buildLine(overrides: Partial<InvoiceLineInput> = {}): InvoiceLineInput {
  return {
    description: 'Farinha de trigo 1kg',
    quantity: 1,
    unitPrice: '10.00',
    grossValue: '10.00',
    isCompanyExpense: true,
    materialId: null,
    ...overrides,
  };
}

function buildInvoice(
  lines: InvoiceLineInput[],
  discountTotal = '0.00',
): RegisterInvoicePurchaseInput {
  const grossTotal = lines
    .reduce((total, line) => total.plus(Money.fromDecimalString(line.grossValue)), Money.zero())
    .toDecimalString();

  return {
    purchaseDate: new Date('2026-09-10T12:00:00Z'),
    accessKey: null,
    rawInvoiceData: null,
    grossTotal,
    discountTotal,
    lines,
  };
}

describe('PurchasesService.registerInvoicePurchase', () => {
  it('stores both sides of every line, with the net side adding up to what was paid', async () => {
    const { service } = buildService();

    const view = await service.registerInvoicePurchase(
      buildInvoice(
        [
          buildLine({ description: 'Farinha', grossValue: '5.00', unitPrice: '5.00' }),
          buildLine({ description: 'Acucar', grossValue: '5.00', unitPrice: '5.00' }),
          buildLine({ description: 'Manteiga', grossValue: '20.00', unitPrice: '20.00' }),
        ],
        '20.00',
      ),
    );

    const netSum = view.items.reduce(
      (total, item) => total.plus(Money.fromDecimalString(item.netValue)),
      Money.zero(),
    );

    expect(view.grossTotal).toBe('30.00');
    expect(view.discountTotal).toBe('20.00');
    expect(view.netTotal).toBe('10.00');
    expect(netSum.toDecimalString()).toBe('10.00');
    expect(view.items.map((item) => item.grossValue)).toEqual(['5.00', '5.00', '20.00']);
  });

  it('leaves the net side equal to the gross side on a note with no discount', async () => {
    const { service } = buildService();

    const view = await service.registerInvoicePurchase(
      buildInvoice([
        buildLine({ grossValue: '7.77', unitPrice: '7.77' }),
        buildLine({ grossValue: '3.33', unitPrice: '3.33' }),
      ]),
    );

    expect(view.items.map((item) => item.netValue)).toEqual(['7.77', '3.33']);
    expect(view.items.map((item) => item.grossValue)).toEqual(['7.77', '3.33']);
  });

  it('feeds the Material packageCost from the gross side even when the note was discounted', async () => {
    const { service, materials } = buildService();
    const material = buildMaterial({ packageCost: Money.fromDecimalString('10.00') });
    await materials.save(material);

    // Half the note was discounted away: the line was paid at 9.00, and the
    // cost recorded must still be the 18.00 it takes to replace the package.
    await service.registerInvoicePurchase(
      buildInvoice(
        [
          buildLine({
            quantity: 1,
            unitPrice: '18.00',
            grossValue: '18.00',
            materialId: material.id,
          }),
          buildLine({
            description: 'Sacolas',
            quantity: 1,
            unitPrice: '18.00',
            grossValue: '18.00',
          }),
        ],
        '18.00',
      ),
    );

    const updated = await materials.findById(material.id);

    expect(updated?.packageCost.toDecimalString()).toBe('18.00');
  });

  it('spreads the gross line value over the packages the line bought', async () => {
    const { service, materials } = buildService();
    const material = buildMaterial({ packageCost: Money.fromDecimalString('1.00') });
    await materials.save(material);

    await service.registerInvoicePurchase(
      buildInvoice([
        buildLine({
          quantity: 4,
          unitPrice: '12.50',
          grossValue: '50.00',
          materialId: material.id,
        }),
      ]),
    );

    const updated = await materials.findById(material.id);

    expect(updated?.packageCost.toDecimalString()).toBe('12.50');
  });

  it('records the cost change as an INVOICE_SYNC price history entry', async () => {
    const { service, materials } = buildService();
    const material = buildMaterial({ packageCost: Money.fromDecimalString('10.00') });
    await materials.save(material);

    await service.registerInvoicePurchase(
      buildInvoice([
        buildLine({
          quantity: 1,
          unitPrice: '14.00',
          grossValue: '14.00',
          materialId: material.id,
        }),
      ]),
    );

    const history = await materials.findPriceHistoryByMaterialId(material.id);

    expect(history).toHaveLength(1);
    expect(history[0].origin).toBe('INVOICE_SYNC');
    expect(history[0].previousValue.toDecimalString()).toBe('10.00');
    expect(history[0].newValue.toDecimalString()).toBe('14.00');
  });

  it('leaves the packageCost alone when the note reports a cheaper package', async () => {
    const { service, materials } = buildService();
    const material = buildMaterial({ packageCost: Money.fromDecimalString('10.00') });
    await materials.save(material);

    await service.registerInvoicePurchase(
      buildInvoice([
        buildLine({ quantity: 1, unitPrice: '6.00', grossValue: '6.00', materialId: material.id }),
      ]),
    );

    const updated = await materials.findById(material.id);

    expect(updated?.packageCost.toDecimalString()).toBe('10.00');
    expect(await materials.findPriceHistoryByMaterialId(material.id)).toHaveLength(0);
  });

  it('rejects a note whose header does not close over its own lines', async () => {
    const { service } = buildService();
    const invoice = buildInvoice([buildLine({ grossValue: '10.00' })]);

    await expect(
      service.registerInvoicePurchase({ ...invoice, grossTotal: '11.00' }),
    ).rejects.toThrow(InvalidPurchaseError);
  });

  it('rejects a note with no lines', async () => {
    const { service } = buildService();

    await expect(service.registerInvoicePurchase(buildInvoice([]))).rejects.toThrow(
      InvalidPurchaseError,
    );
  });

  it('rejects a line matched to a Material that does not exist', async () => {
    const { service } = buildService();

    await expect(
      service.registerInvoicePurchase(
        buildInvoice([buildLine({ materialId: 'a4d1b0e4-0000-4000-8000-000000000000' })]),
      ),
    ).rejects.toThrow(UnknownMaterialReferenceError);
  });
});
