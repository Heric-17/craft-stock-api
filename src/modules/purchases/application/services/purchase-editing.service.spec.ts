import type { RepositoryContext } from '../../../../shared/domain/persistence/unit-of-work';
import { InMemoryUnitOfWork } from '../../../../shared/infrastructure/persistence/in-memory-unit-of-work';
import { InMemoryCompositeProductRepository } from '../../../composite-products/infrastructure/persistence/in-memory-composite-product.repository';
import { InMemoryPendingInvoiceRepository } from '../../../invoices/infrastructure/persistence/in-memory-pending-invoice.repository';
import { InMemoryMaterialRepository } from '../../../materials/infrastructure/persistence/in-memory-material.repository';
import { InMemorySaleRepository } from '../../../sales/infrastructure/persistence/in-memory-sale.repository';
import { InMemoryRefreshTokenRepository } from '../../../auth/infrastructure/persistence/in-memory-refresh-token.repository';
import { InMemoryUserRepository } from '../../../users/infrastructure/persistence/in-memory-user.repository';
import { InMemoryPurchaseRepository } from '../../infrastructure/persistence/in-memory-purchase.repository';
import {
  DiscountAllocationError,
  PendingDiscountAllocationError,
  PurchaseNotFoundError,
} from '../../domain/purchase.error';
import type { PurchaseView } from '../dto/purchases.dto';
import { PurchaseEditingService } from './purchase-editing.service';
import { PurchasesService } from './purchases.service';

interface Suite {
  purchases: PurchasesService;
  editing: PurchaseEditingService;
  repository: InMemoryPurchaseRepository;
}

/** The captured note, as the extraction froze it. */
const RAW_INVOICE = {
  merchantName: 'ATACADAO S.A.',
  cnpj: '75.315.333/0088-60',
  accessKey: '4'.repeat(44),
  grossTotal: '100.00',
  items: [
    { code: '7891', description: 'FARINHA TRIGO 1KG', quantity: 1, grossValue: '60.00' },
    { code: '7892', description: 'ACUCAR 1KG', quantity: 1, grossValue: '40.00' },
  ],
};

function buildSuite(): Suite {
  const repository = new InMemoryPurchaseRepository();
  const context: RepositoryContext = {
    materials: new InMemoryMaterialRepository(),
    compositeProducts: new InMemoryCompositeProductRepository(),
    sales: new InMemorySaleRepository(),
    purchases: repository,
    pendingInvoices: new InMemoryPendingInvoiceRepository(),
    users: new InMemoryUserRepository(),
    refreshTokens: new InMemoryRefreshTokenRepository(),
  };
  const unitOfWork = new InMemoryUnitOfWork(context);

  return {
    purchases: new PurchasesService(unitOfWork, repository),
    editing: new PurchaseEditingService(unitOfWork),
    repository,
  };
}

async function importedPurchase(
  suite: Suite,
  overrides: { discountTotal?: string } = {},
): Promise<PurchaseView> {
  return suite.purchases.registerInvoicePurchase({
    purchaseDate: new Date('2026-09-10T12:00:00Z'),
    accessKey: '4'.repeat(44),
    // A fresh copy each time: the point of these tests is what the system
    // does to it, not what a shared literal ends up holding.
    rawInvoiceData: structuredClone(RAW_INVOICE),
    establishment: { name: 'ATACADAO S.A.', cnpj: '75.315.333/0088-60' },
    grossTotal: '100.00',
    discountTotal: overrides.discountTotal ?? '0.00',
    lines: [
      {
        code: '7891',
        description: 'FARINHA TRIGO 1KG',
        quantity: 1,
        unitPrice: '60.00',
        grossValue: '60.00',
        isCompanyExpense: true,
        materialId: null,
      },
      {
        code: '7892',
        description: 'ACUCAR 1KG',
        quantity: 1,
        unitPrice: '40.00',
        grossValue: '40.00',
        isCompanyExpense: true,
        materialId: null,
      },
    ],
  });
}

/**
 * The captured note is what the user reconciles the purchase against on the
 * card statement. If editing the lines could move it, it would stop being
 * evidence of anything: a purchase edited down to half its value would also
 * report half the total the card was charged, and the discrepancy that is
 * supposed to be visible would simply vanish.
 */
describe('PurchaseEditingService does not touch rawInvoiceData', () => {
  it('keeps the snapshot through adding, changing and removing lines', async () => {
    const suite = buildSuite();
    const created = await importedPurchase(suite);

    await suite.editing.addItem(created.id, {
      description: 'SACOLA',
      quantity: 2,
      unitPrice: '1.50',
      grossValue: '3.00',
      isCompanyExpense: true,
      materialId: null,
    });
    await suite.editing.changeItem(created.id, created.items[0].id, {
      quantity: 3,
      unitPrice: '25.00',
      grossValue: '75.00',
    });
    const edited = await suite.editing.removeItem(created.id, created.items[1].id);

    // The lines have moved a long way from the note...
    expect(edited.items.map((item) => item.description)).toEqual(['FARINHA TRIGO 1KG', 'SACOLA']);
    expect(edited.grossTotal).toBe('78.00');

    // ...and the note still says exactly what it said when it was captured,
    // including the line that is no longer part of the purchase.
    expect(edited.rawInvoiceData).toEqual(RAW_INVOICE);

    const reloaded = await suite.repository.findById(created.id);
    expect(reloaded?.rawInvoiceData).toEqual(RAW_INVOICE);
  });

  it('keeps the snapshot through reattributing the discount', async () => {
    const suite = buildSuite();
    const created = await importedPurchase(suite, { discountTotal: '10.00' });

    const reallocated = await suite.editing.setDiscountAllocation(created.id, {
      mode: 'MANUAL',
      manualAllocation: [
        { itemId: created.items[0].id, allocatedDiscount: '10.00' },
        { itemId: created.items[1].id, allocatedDiscount: '0.00' },
      ],
    });

    expect(reallocated.discountAllocationMode).toBe('MANUAL');
    expect(reallocated.rawInvoiceData).toEqual(RAW_INVOICE);
  });

  it('refuses to be written through the object it handed back', async () => {
    const suite = buildSuite();
    const created = await importedPurchase(suite);
    const loaded = await suite.repository.findById(created.id);
    const snapshot = loaded?.rawInvoiceData as Record<string, unknown>;

    // Frozen, not merely never reassigned: "the edit does not touch it" has
    // to hold against a caller reaching into the object as well.
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.items)).toBe(true);
    expect(() => {
      'use strict';
      (snapshot as { grossTotal: string }).grossTotal = '1.00';
    }).toThrow(TypeError);
    expect(snapshot.grossTotal).toBe('100.00');
  });
});

describe('PurchaseEditingService under MANUAL attribution', () => {
  it('parks the purchase in pending attribution and refuses to close the edit', async () => {
    const suite = buildSuite();
    const created = await importedPurchase(suite, { discountTotal: '10.00' });

    await suite.editing.setDiscountAllocation(created.id, {
      mode: 'MANUAL',
      manualAllocation: [
        { itemId: created.items[0].id, allocatedDiscount: '6.00' },
        { itemId: created.items[1].id, allocatedDiscount: '4.00' },
      ],
    });

    const pending = await suite.editing.removeItem(created.id, created.items[1].id);

    // Nothing can work out where the 4.00 the removed line was carrying
    // should go, so the purchase waits for the user instead of guessing.
    expect(pending.allocationPending).toBe(true);
    await expect(suite.editing.completeEdit(created.id)).rejects.toThrow(
      PendingDiscountAllocationError,
    );

    const restated = await suite.editing.setDiscountAllocation(created.id, {
      mode: 'MANUAL',
      manualAllocation: [{ itemId: created.items[0].id, allocatedDiscount: '10.00' }],
    });

    expect(restated.allocationPending).toBe(false);
    await expect(suite.editing.completeEdit(created.id)).resolves.toMatchObject({
      allocationPending: false,
    });
  });

  it('is left pending by a change of value too, because the per-line ceiling moved', async () => {
    const suite = buildSuite();
    const created = await importedPurchase(suite, { discountTotal: '10.00' });

    await suite.editing.setDiscountAllocation(created.id, {
      mode: 'MANUAL',
      manualAllocation: [
        { itemId: created.items[0].id, allocatedDiscount: '10.00' },
        { itemId: created.items[1].id, allocatedDiscount: '0.00' },
      ],
    });

    // The line carrying the whole discount is corrected down to 8.00, which
    // is less than the 10.00 of discount sitting on it.
    const pending = await suite.editing.changeItem(created.id, created.items[0].id, {
      quantity: 1,
      unitPrice: '8.00',
      grossValue: '8.00',
    });

    expect(pending.allocationPending).toBe(true);
    await expect(suite.editing.completeEdit(created.id)).rejects.toThrow(
      PendingDiscountAllocationError,
    );
  });

  it('closes the edit by itself in the computed modes', async () => {
    const suite = buildSuite();
    const created = await importedPurchase(suite, { discountTotal: '10.00' });

    const edited = await suite.editing.removeItem(created.id, created.items[1].id);

    // PROPORTIONAL has something to recompute, so the root reattributes and
    // the sum closes again without asking anyone.
    expect(edited.allocationPending).toBe(false);
    expect(edited.items[0].allocatedDiscount).toBe('10.00');
    await expect(suite.editing.completeEdit(created.id)).resolves.toMatchObject({
      allocationPending: false,
    });
  });

  it('refuses per-line amounts in a mode that computes them', async () => {
    const suite = buildSuite();
    const created = await importedPurchase(suite, { discountTotal: '10.00' });

    await expect(
      suite.editing.setDiscountAllocation(created.id, {
        mode: 'PROPORTIONAL',
        manualAllocation: [{ itemId: created.items[0].id, allocatedDiscount: '10.00' }],
      }),
    ).rejects.toThrow(DiscountAllocationError);
  });

  it('reports an unknown purchase rather than creating one', async () => {
    const suite = buildSuite();

    await expect(
      suite.editing.removeItem('0f4b2f8c-1d3e-4a5b-8c7d-9e0f1a2b3c4d', 'whatever'),
    ).rejects.toThrow(PurchaseNotFoundError);
  });
});
