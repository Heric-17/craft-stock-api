import { randomUUID } from 'node:crypto';

import { Money } from '../../../../shared/domain/money/money';
import type { RepositoryContext } from '../../../../shared/domain/persistence/unit-of-work';
import { InMemoryUnitOfWork } from '../../../../shared/infrastructure/persistence/in-memory-unit-of-work';
import { InMemoryCompositeProductRepository } from '../../../composite-products/infrastructure/persistence/in-memory-composite-product.repository';
import { Material } from '../../../materials/domain/material.entity';
import { InMemoryMaterialRepository } from '../../../materials/infrastructure/persistence/in-memory-material.repository';
import type { DiscountAllocationMode } from '../../../purchases/domain/discount-allocation-mode';
import { DISCOUNT_ALLOCATION_MODES } from '../../../purchases/domain/discount-allocation-mode';
import { Purchase } from '../../../purchases/domain/purchase.entity';
import { PurchaseItem } from '../../../purchases/domain/purchase-item.entity';
import {
  DiscountAllocationError,
  PurchaseNotFoundError,
} from '../../../purchases/domain/purchase.error';
import { InMemoryPurchaseRepository } from '../../../purchases/infrastructure/persistence/in-memory-purchase.repository';
import { InMemorySaleRepository } from '../../../sales/infrastructure/persistence/in-memory-sale.repository';
import { InMemoryRefreshTokenRepository } from '../../../auth/infrastructure/persistence/in-memory-refresh-token.repository';
import { InMemoryUserRepository } from '../../../users/infrastructure/persistence/in-memory-user.repository';
import { InMemoryPendingInvoiceRepository } from '../../infrastructure/persistence/in-memory-pending-invoice.repository';
import { InvoiceClassificationService } from './invoice-classification.service';

const money = (value: string): Money => Money.fromDecimalString(value);

function buildService(): {
  service: InvoiceClassificationService;
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
    refreshTokens: new InMemoryRefreshTokenRepository(),
  };

  return {
    service: new InvoiceClassificationService(new InMemoryUnitOfWork(context)),
    materials,
    purchases,
  };
}

/** Flour at 20 (4 packs of 5.00) and wine at 100, with a discount on the note. */
async function seedPurchase(
  purchases: InMemoryPurchaseRepository,
  discount = '0.00',
): Promise<Purchase> {
  const id = randomUUID();
  const items = [
    new PurchaseItem({
      id: 'flour',
      purchaseId: id,
      code: '4424',
      description: 'FARINHA DE TRIGO',
      quantity: 4,
      unit: 'PCT9',
      unitPrice: money('5.00'),
      grossValue: money('20.00'),
      allocatedDiscount: Money.zero(),
      isCompanyExpense: true,
      isStockMaterial: false,
      materialId: null,
    }),
    new PurchaseItem({
      id: 'wine',
      purchaseId: id,
      code: '9999',
      description: 'VINHO',
      quantity: 1,
      unit: 'UND9',
      unitPrice: money('100.00'),
      grossValue: money('100.00'),
      allocatedDiscount: Money.zero(),
      isCompanyExpense: true,
      isStockMaterial: false,
      materialId: null,
    }),
  ];

  const discountTotal = money(discount);
  const purchase = new Purchase({
    id,
    purchaseDate: new Date('2026-06-11T21:46:31Z'),
    accessKey: null,
    rawInvoiceData: { merchantName: 'ATACADAO S.A.' },
    establishment: null,
    grossTotal: money('120.00'),
    discountTotal,
    netTotal: money('120.00').minus(discountTotal),
    discountAllocationMode: 'PROPORTIONAL',
    allocationPending: !discountTotal.isZero(),
    items,
    createdAt: new Date(),
  }).changeDiscountAllocation('PROPORTIONAL');

  await purchases.save(purchase);

  return purchase;
}

describe('InvoiceClassificationService, stock entry', () => {
  it('creates the Material the user named and brings the line into stock', async () => {
    const { service, materials, purchases } = buildService();
    const purchase = await seedPurchase(purchases);

    const view = await service.classify({
      purchaseId: purchase.id,
      items: [
        {
          itemId: 'flour',
          isCompanyExpense: true,
          isStockMaterial: true,
          // 4 packets of 1 kg, consumed in grams.
          packageQuantity: 1000,
          newMaterial: { name: 'Farinha de trigo', consumptionUnit: 'GRAM' },
        },
        { itemId: 'wine', isCompanyExpense: false, isStockMaterial: false },
      ],
    });

    const [material] = await materials.findAll();

    expect(material.name).toBe('Farinha de trigo');
    expect(material.packageQuantity).toBe(1000);
    // 4 packets × 1000 g each.
    expect(material.stockQuantity).toBe(4000);
    expect(view.items.find((item) => item.id === 'flour')?.materialId).toBe(material.id);
  });

  it('creates the Material with the consumption unit the user gave', async () => {
    const { service, materials, purchases } = buildService();
    const purchase = await seedPurchase(purchases);

    const view = await service.classify({
      purchaseId: purchase.id,
      items: [
        {
          itemId: 'flour',
          isCompanyExpense: true,
          isStockMaterial: true,
          packageQuantity: 1000,
          newMaterial: { name: 'Farinha de trigo', consumptionUnit: 'GRAM' },
        },
      ],
    });

    const [material] = await materials.findAll();

    expect(material.consumptionUnit).toBe('GRAM');
    // Reported back beside the line, so the user can check the 1000 they
    // typed is being counted in the unit they meant.
    expect(view.items.find((item) => item.id === 'flour')?.materialConsumptionUnit).toBe('GRAM');
    expect(view.items.find((item) => item.id === 'flour')?.materialConsumptionUnitSymbol).toBe('g');
  });

  /**
   * The note rang the flour up as `PCT9` — packets. That says how the till
   * sold it, not how the kitchen measures it, and it must not reach the
   * Material: a Material silently created as packets would hold "4" in stock
   * while every recipe asks for grams.
   */
  it('never takes the consumption unit from the unit printed on the note', async () => {
    const { service, materials, purchases } = buildService();
    const purchase = await seedPurchase(purchases);

    const view = await service.classify({
      purchaseId: purchase.id,
      items: [
        {
          itemId: 'flour',
          isCompanyExpense: true,
          isStockMaterial: true,
          packageQuantity: 1000,
          newMaterial: { name: 'Farinha de trigo', consumptionUnit: 'GRAM' },
        },
      ],
    });

    const [material] = await materials.findAll();
    const line = view.items.find((item) => item.id === 'flour');

    // The note's own unit is kept, untouched, as what it is: a record of
    // what the establishment printed.
    expect(line?.unit).toBe('PCT9');
    expect(line?.unitDisplay).toBe('PCT');
    expect(material.consumptionUnit).toBe('GRAM');
  });

  /**
   * An existing Material already has a unit, and classifying a note is not
   * where it changes: that would reinterpret its stock balance and every
   * recipe quantity, from a screen about a purchase.
   */
  it('keeps the consumption unit of an existing Material and reports it back', async () => {
    const { service, materials, purchases } = buildService();
    const purchase = await seedPurchase(purchases);
    const now = new Date();
    const existing = new Material({
      id: randomUUID(),
      name: 'Farinha de trigo',
      description: null,
      imageUrl: null,
      packageCost: money('4.00'),
      packageQuantity: 1000,
      consumptionUnit: 'GRAM',
      stockQuantity: 500,
      minimumStockAlert: 100,
      discontinuedAt: null,
      createdAt: now,
      updatedAt: now,
    });
    await materials.save(existing);

    const view = await service.classify({
      purchaseId: purchase.id,
      items: [
        {
          itemId: 'flour',
          isCompanyExpense: true,
          isStockMaterial: true,
          packageQuantity: 1000,
          materialId: existing.id,
        },
      ],
    });

    const reloaded = await materials.findById(existing.id);

    expect(reloaded?.consumptionUnit).toBe('GRAM');
    expect(view.items.find((item) => item.id === 'flour')?.materialConsumptionUnit).toBe('GRAM');
  });

  /**
   * packageCost is the cost of one package — the line's gross value divided
   * by how many were bought — and unitCost follows from it and the package
   * contents the user gave.
   */
  it('sets packageCost from the line gross value, per package', async () => {
    const { service, materials, purchases } = buildService();
    const purchase = await seedPurchase(purchases);

    await service.classify({
      purchaseId: purchase.id,
      items: [
        {
          itemId: 'flour',
          isCompanyExpense: true,
          isStockMaterial: true,
          packageQuantity: 1000,
          newMaterial: { name: 'Farinha de trigo', consumptionUnit: 'GRAM' },
        },
      ],
    });

    const [material] = await materials.findAll();

    expect(material.packageCost.toDecimalString()).toBe('5.00');
    expect(material.unitCost).toBe('0.0050');
  });

  /**
   * The unit printed on the note describes how the item was rung up, not how
   * it is consumed. The user is the only source for the conversion.
   */
  it('refuses a stock line with no packageQuantity from the user', async () => {
    const { service, purchases } = buildService();
    const purchase = await seedPurchase(purchases);

    await expect(
      service.classify({
        purchaseId: purchase.id,
        items: [
          {
            itemId: 'flour',
            isCompanyExpense: true,
            isStockMaterial: true,
            newMaterial: { name: 'Farinha de trigo', consumptionUnit: 'GRAM' },
          },
        ],
      }),
    ).rejects.toThrow(/packageQuantity/);
  });

  it('adds to an existing Material rather than creating a second one', async () => {
    const { service, materials, purchases } = buildService();
    const purchase = await seedPurchase(purchases);
    const now = new Date();
    const existing = new Material({
      id: randomUUID(),
      name: 'Farinha de trigo',
      description: null,
      imageUrl: null,
      packageCost: money('4.00'),
      packageQuantity: 1000,
      consumptionUnit: 'GRAM',
      stockQuantity: 500,
      minimumStockAlert: 100,
      discontinuedAt: null,
      createdAt: now,
      updatedAt: now,
    });
    await materials.save(existing);

    await service.classify({
      purchaseId: purchase.id,
      items: [
        {
          itemId: 'flour',
          isCompanyExpense: true,
          isStockMaterial: true,
          packageQuantity: 1000,
          materialId: existing.id,
        },
      ],
    });

    expect(await materials.findAll()).toHaveLength(1);
    expect((await materials.findById(existing.id))?.stockQuantity).toBe(4500);
  });
});

describe('InvoiceClassificationService, the price-only-rises rule', () => {
  async function classifyWithExistingCost(cost: string): Promise<Material> {
    const { service, materials, purchases } = buildService();
    const purchase = await seedPurchase(purchases);
    const now = new Date();
    const existing = new Material({
      id: randomUUID(),
      name: 'Farinha de trigo',
      description: null,
      imageUrl: null,
      packageCost: money(cost),
      packageQuantity: 1000,
      consumptionUnit: 'GRAM',
      stockQuantity: 0,
      minimumStockAlert: 0,
      discontinuedAt: null,
      createdAt: now,
      updatedAt: now,
    });
    await materials.save(existing);

    await service.classify({
      purchaseId: purchase.id,
      items: [
        {
          itemId: 'flour',
          isCompanyExpense: true,
          isStockMaterial: true,
          packageQuantity: 1000,
          materialId: existing.id,
        },
      ],
    });

    return (await materials.findById(existing.id)) as Material;
  }

  it('takes a higher cost from the note', async () => {
    // The line reports 5.00 per package against a recorded 4.00.
    expect((await classifyWithExistingCost('4.00')).packageCost.toDecimalString()).toBe('5.00');
  });

  /**
   * A one-off cheap purchase must not pull down the cost used to plan future
   * restocking: the recorded cost is the worst case for replacement, which
   * is what protects the margin.
   */
  it('keeps the recorded cost when the note is cheaper', async () => {
    expect((await classifyWithExistingCost('9.00')).packageCost.toDecimalString()).toBe('9.00');
  });

  it('records a price history entry when the cost rises', async () => {
    const { service, materials, purchases } = buildService();
    const purchase = await seedPurchase(purchases);
    const now = new Date();
    const existing = new Material({
      id: randomUUID(),
      name: 'Farinha',
      description: null,
      imageUrl: null,
      packageCost: money('4.00'),
      packageQuantity: 1000,
      consumptionUnit: 'GRAM',
      stockQuantity: 0,
      minimumStockAlert: 0,
      discontinuedAt: null,
      createdAt: now,
      updatedAt: now,
    });
    await materials.save(existing);

    await service.classify({
      purchaseId: purchase.id,
      items: [
        {
          itemId: 'flour',
          isCompanyExpense: true,
          isStockMaterial: true,
          packageQuantity: 1000,
          materialId: existing.id,
        },
      ],
    });

    const history = await materials.findPriceHistoryByMaterialId(existing.id);

    expect(history).toHaveLength(1);
    expect(history[0].origin).toBe('INVOICE_SYNC');
    expect(history[0].newValue.toDecimalString()).toBe('5.00');
  });
});

describe('InvoiceClassificationService, packageCost is never net of discount', () => {
  /**
   * The rule that must survive every mode: a discount is a one-off event
   * while packageCost answers what restocking costs next time.
   */
  it.each(DISCOUNT_ALLOCATION_MODES)(
    'feeds packageCost from grossValue under %s',
    async (mode: DiscountAllocationMode) => {
      const { service, materials, purchases } = buildService();
      const purchase = await seedPurchase(purchases, '12.00');

      await service.classify({
        purchaseId: purchase.id,
        items: [
          {
            itemId: 'flour',
            isCompanyExpense: true,
            isStockMaterial: true,
            packageQuantity: 1000,
            newMaterial: { name: 'Farinha de trigo', consumptionUnit: 'GRAM' },
          },
          { itemId: 'wine', isCompanyExpense: false, isStockMaterial: false },
        ],
        discountAllocationMode: mode,
        manualAllocation:
          mode === 'MANUAL'
            ? [
                { itemId: 'flour', allocatedDiscount: '2.00' },
                { itemId: 'wine', allocatedDiscount: '10.00' },
              ]
            : undefined,
      });

      const [material] = await materials.findAll();

      // 20.00 gross over 4 packages, whatever discount the line absorbed.
      expect(material.packageCost.toDecimalString()).toBe('5.00');
    },
  );
});

describe('InvoiceClassificationService, discount attribution', () => {
  it('reattributes when a line is reclassified out of the company group', async () => {
    const { service, purchases } = buildService();
    const purchase = await seedPurchase(purchases, '12.00');

    const view = await service.classify({
      purchaseId: purchase.id,
      items: [
        { itemId: 'flour', isCompanyExpense: true, isStockMaterial: false },
        { itemId: 'wine', isCompanyExpense: false, isStockMaterial: false },
      ],
      discountAllocationMode: 'COMPANY_ONLY',
    });

    expect(view.items.find((item) => item.id === 'flour')?.allocatedDiscount).toBe('12.00');
    expect(view.items.find((item) => item.id === 'wine')?.allocatedDiscount).toBe('0.00');
  });

  /**
   * The request that used to fail: the mode is already PERSONAL_ONLY and the
   * same body is sent again. Line by line, marking flour as company emptied
   * the personal group halfway through and the whole call was rejected.
   */
  it('accepts a classification resent under the mode it already has', async () => {
    const { service, purchases } = buildService();
    const purchase = await seedPurchase(purchases, '12.00');

    const body = {
      purchaseId: purchase.id,
      items: [
        { itemId: 'flour', isCompanyExpense: true, isStockMaterial: false },
        { itemId: 'wine', isCompanyExpense: false, isStockMaterial: false },
      ],
      discountAllocationMode: 'PERSONAL_ONLY' as const,
    };

    await service.classify(body);
    const again = await service.classify(body);

    expect(again.items.find((item) => item.id === 'wine')?.allocatedDiscount).toBe('12.00');
    expect(again.items.find((item) => item.id === 'flour')?.allocatedDiscount).toBe('0.00');
  });

  /**
   * The request that actually failed in use, with the note's own numbers.
   * The purchase was sitting in PERSONAL_ONLY with the wine as its only
   * personal line, and the batch moved that line to company while switching
   * to MANUAL. Applied line by line, marking the last personal line as
   * company emptied the PERSONAL_ONLY group before the mode switch ever
   * happened, and the whole call was rejected.
   */
  it('switches to MANUAL while moving the last personal line to company', async () => {
    const { service, purchases } = buildService();
    const purchase = await seedPurchase(purchases, '0.80');

    await service.classify({
      purchaseId: purchase.id,
      items: [
        { itemId: 'flour', isCompanyExpense: true, isStockMaterial: false },
        { itemId: 'wine', isCompanyExpense: false, isStockMaterial: false },
      ],
      discountAllocationMode: 'PERSONAL_ONLY',
    });

    const manual = await service.classify({
      purchaseId: purchase.id,
      items: [
        { itemId: 'flour', isCompanyExpense: true, isStockMaterial: false },
        { itemId: 'wine', isCompanyExpense: true, isStockMaterial: false },
      ],
      discountAllocationMode: 'MANUAL',
      manualAllocation: [
        { itemId: 'flour', allocatedDiscount: '0.80' },
        { itemId: 'wine', allocatedDiscount: '0.00' },
      ],
    });

    expect(manual.discountAllocationMode).toBe('MANUAL');
    expect(manual.items.find((item) => item.id === 'flour')?.allocatedDiscount).toBe('0.80');
    expect(manual.items.find((item) => item.id === 'wine')?.allocatedDiscount).toBe('0.00');
    expect(manual.items.every((item) => item.isCompanyExpense)).toBe(true);
  });

  it('accepts flipping both lines in a single call', async () => {
    const { service, purchases } = buildService();
    const purchase = await seedPurchase(purchases, '12.00');

    await service.classify({
      purchaseId: purchase.id,
      items: [
        { itemId: 'flour', isCompanyExpense: true, isStockMaterial: false },
        { itemId: 'wine', isCompanyExpense: false, isStockMaterial: false },
      ],
      discountAllocationMode: 'COMPANY_ONLY',
    });

    const flipped = await service.classify({
      purchaseId: purchase.id,
      items: [
        { itemId: 'flour', isCompanyExpense: false, isStockMaterial: false },
        { itemId: 'wine', isCompanyExpense: true, isStockMaterial: false },
      ],
    });

    expect(flipped.items.find((item) => item.id === 'wine')?.allocatedDiscount).toBe('12.00');
    expect(flipped.items.find((item) => item.id === 'flour')?.allocatedDiscount).toBe('0.00');
  });

  it('refuses COMPANY_ONLY when nothing is a company expense', async () => {
    const { service, purchases } = buildService();
    const purchase = await seedPurchase(purchases, '12.00');

    await expect(
      service.classify({
        purchaseId: purchase.id,
        items: [
          { itemId: 'flour', isCompanyExpense: false, isStockMaterial: false },
          { itemId: 'wine', isCompanyExpense: false, isStockMaterial: false },
        ],
        discountAllocationMode: 'COMPANY_ONLY',
      }),
    ).rejects.toThrow(DiscountAllocationError);
  });

  it('refuses MANUAL amounts that do not add up to the note discount', async () => {
    const { service, purchases } = buildService();
    const purchase = await seedPurchase(purchases, '12.00');

    await expect(
      service.classify({
        purchaseId: purchase.id,
        items: [{ itemId: 'flour', isCompanyExpense: true, isStockMaterial: false }],
        discountAllocationMode: 'MANUAL',
        manualAllocation: [{ itemId: 'flour', allocatedDiscount: '5.00' }],
      }),
    ).rejects.toThrow(DiscountAllocationError);
  });

  it('does not consult the user on a note with no discount', async () => {
    const { service, purchases } = buildService();
    const purchase = await seedPurchase(purchases);

    const view = await service.classify({
      purchaseId: purchase.id,
      items: [{ itemId: 'flour', isCompanyExpense: true, isStockMaterial: false }],
      // Even if a mode arrives, there is nothing to attribute.
      discountAllocationMode: 'COMPANY_ONLY',
    });

    expect(view.requiresDiscountAllocationChoice).toBe(false);
    expect(view.items.every((item) => item.allocatedDiscount === '0.00')).toBe(true);
  });

  it('leaves the attributed amounts closing with discountTotal', async () => {
    const { service, purchases } = buildService();
    const purchase = await seedPurchase(purchases, '12.00');

    const view = await service.classify({
      purchaseId: purchase.id,
      items: [
        { itemId: 'flour', isCompanyExpense: true, isStockMaterial: false },
        { itemId: 'wine', isCompanyExpense: true, isStockMaterial: false },
      ],
      discountAllocationMode: 'PROPORTIONAL',
    });

    const attributed = view.items.reduce(
      (total, item) => total + Number(item.allocatedDiscount),
      0,
    );

    expect(attributed).toBeCloseTo(12, 10);
    expect(view.allocationPending).toBe(false);
  });
});

describe('InvoiceClassificationService, unit handling', () => {
  it('normalises the note unit for display and keeps the raw one', async () => {
    const { service, purchases } = buildService();
    const purchase = await seedPurchase(purchases);

    const view = await service.classify({
      purchaseId: purchase.id,
      items: [{ itemId: 'flour', isCompanyExpense: true, isStockMaterial: false }],
    });

    const flour = view.items.find((item) => item.id === 'flour');

    expect(flour?.unit).toBe('PCT9');
    expect(flour?.unitDisplay).toBe('PCT');
  });
});

describe('InvoiceClassificationService, missing purchase', () => {
  it('reports a purchase that does not exist', async () => {
    const { service } = buildService();

    await expect(
      service.classify({
        purchaseId: 'nope',
        items: [{ itemId: 'x', isCompanyExpense: true, isStockMaterial: false }],
      }),
    ).rejects.toThrow(PurchaseNotFoundError);
  });
});
