import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';

import { HttpStatus, type INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';

import { AppModule } from '../src/app.module';
import { Material } from '../src/modules/materials/domain/material.entity';
import {
  MATERIAL_REPOSITORY,
  type MaterialRepository,
} from '../src/modules/materials/domain/repositories/material.repository';
import type { SalesDatasetView } from '../src/modules/sales/application/dto/sales.dto';
import { SalesAnalyticsService } from '../src/modules/sales/application/services/sales-analytics.service';
import type { PaymentStatus } from '../src/modules/sales/domain/payment-status.enum';
import type { ProductionStatus } from '../src/modules/sales/domain/production-status.enum';
import {
  SALE_REPOSITORY,
  type SaleRepository,
} from '../src/modules/sales/domain/repositories/sale.repository';
import { saleTotal } from '../src/modules/sales/domain/sale-line-total';
import { SaleItem } from '../src/modules/sales/domain/sale-item.entity';
import { Sale } from '../src/modules/sales/domain/sale.entity';
import { Money } from '../src/shared/domain/money/money';
import { PrismaService } from '../src/shared/infrastructure/prisma/prisma.service';
import { authenticate } from './support/authenticate';
import { configureTestApp } from './support/configure-test-app';
import { api } from './support/api';

/**
 * Real-Postgres proof that the sales dataset adds up to exactly what the detail
 * of each sale shows.
 *
 * The oracle is deliberately not the code under test. Each sale is reloaded
 * through the real `PrismaSaleRepository` and totalled item by item with the
 * domain (`saleTotal`), and then a second time by a plain-integer
 * implementation of the rounding written in this file, so a mistake in the
 * dataset cannot be hidden by the same mistake in the thing it is compared to.
 * Equality is exact, in cents.
 */

/** Brazil has no daylight saving time in these years, so local time is UTC-3. */
const BUSINESS_OFFSET_HOURS = 3;

type Line = [priceBasisAmount: string, quantity: number, priceBasisQuantity: number];

interface Spec {
  createdAt: string;
  paymentStatus: PaymentStatus;
  productionStatus: ProductionStatus;
  lines: Line[];
}

/** `numerator ÷ denominator`, half away from zero, in plain BigInt. */
function roundedDivision(numerator: bigint, denominator: bigint): bigint {
  return (2n * numerator + denominator) / (2n * denominator);
}

/** A line total in cents, computed with no `Money` at all. Non-negative inputs only. */
function independentLineCents(amount: string, quantity: number, basisQuantity: number): bigint {
  const cents = BigInt(Math.round(Number(amount) * 100));
  const milli = (value: number): bigint => BigInt(Math.round(value * 1000));

  return roundedDivision(cents * milli(quantity), milli(basisQuantity));
}

function independentMonth(createdAt: Date): string {
  return new Date(createdAt.getTime() - BUSINESS_OFFSET_HOURS * 3_600_000)
    .toISOString()
    .slice(0, 7);
}

describe('Sales dataset against the sales as the domain totals them (e2e)', () => {
  let app: INestApplication;
  let server: Server;
  let analytics: SalesAnalyticsService;
  let sales: SaleRepository;
  let materials: MaterialRepository;
  let prisma: PrismaService;
  let authHeader: string;
  let actorUserId: string;
  let materialId: string;

  const createdSaleIds: string[] = [];

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    configureTestApp(app, moduleRef);
    await app.init();
    server = app.getHttpServer() as Server;

    analytics = moduleRef.get(SalesAnalyticsService);
    sales = moduleRef.get(SALE_REPOSITORY);
    materials = moduleRef.get(MATERIAL_REPOSITORY);
    prisma = moduleRef.get(PrismaService);
    ({ authHeader, userId: actorUserId } = await authenticate(moduleRef, server));

    const now = new Date();
    const material = new Material({
      id: randomUUID(),
      name: `Insumo ${randomUUID()}`,
      description: null,
      imageKey: null,
      packageCost: Money.fromDecimalString('28.00'),
      packageQuantity: 1000,
      consumptionUnit: 'GRAM',
      stockQuantity: 0,
      minimumStockAlert: 0,
      discontinuedAt: null,
      createdAt: now,
      updatedAt: now,
    });
    await materials.save(material);
    materialId = material.id;
  });

  afterAll(async () => {
    for (const saleId of createdSaleIds) {
      await prisma.saleItem.deleteMany({ where: { saleId } });
      await prisma.sale.deleteMany({ where: { id: saleId } });
    }
    await prisma.material.deleteMany({ where: { id: materialId } });
    await prisma.user.deleteMany({ where: { id: actorUserId } });

    await app.close();
  });

  async function record(spec: Spec): Promise<string> {
    const id = randomUUID();
    const createdAt = new Date(spec.createdAt);

    await sales.save(
      new Sale({
        id,
        customerName: 'Cliente',
        customerContact: null,
        paymentMethod: 'PIX',
        paymentStatus: spec.paymentStatus,
        productionStatus: spec.productionStatus,
        createdAt,
        updatedAt: createdAt,
      }),
    );
    await sales.saveItems(
      spec.lines.map(
        ([amount, quantity, priceBasisQuantity], index) =>
          new SaleItem({
            id: `${id}-${index}`,
            saleId: id,
            compositeProductId: null,
            materialId,
            quantity,
            itemNameSnapshot: 'Item',
            priceBasisAmount: Money.fromDecimalString(amount),
            priceBasisQuantity,
            consumptionUnit: 'GRAM',
          }),
      ),
    );
    createdSaleIds.push(id);

    return id;
  }

  /** What the domain says each of the given sales totals, reloaded from Postgres. */
  async function totalsFromTheDomain(ids: readonly string[]) {
    const totals = [];

    for (const id of ids) {
      const sale = await sales.findById(id);
      const items = await sales.findItemsBySaleId(id);

      if (sale === null) {
        throw new Error(`sale ${id} was not saved`);
      }

      totals.push({
        month: independentMonth(sale.createdAt),
        paymentStatus: sale.paymentStatus,
        productionStatus: sale.productionStatus,
        // The domain, item by item: each line rounded, then summed.
        domainCents: items.reduce((sum, item) => sum.plus(item.lineTotal), Money.zero()).toCents(),
        // And the same figure from the sale-level function the dataset uses.
        saleTotalCents: saleTotal(items).toCents(),
        // And a third time, in plain integers, with no Money involved.
        independentCents: Number(
          items.reduce(
            (sum, item) =>
              sum +
              independentLineCents(
                item.priceBasisAmount.toDecimalString(),
                item.quantity,
                item.priceBasisQuantity,
              ),
            0n,
          ),
        ),
      });
    }

    return totals;
  }

  function foldBy<T extends string>(
    totals: Awaited<ReturnType<typeof totalsFromTheDomain>>,
    key: (total: Awaited<ReturnType<typeof totalsFromTheDomain>>[number]) => T,
  ): Map<T, { count: number; cents: number }> {
    const folded = new Map<T, { count: number; cents: number }>();

    for (const total of totals) {
      const current = folded.get(key(total)) ?? { count: 0, cents: 0 };
      folded.set(key(total), {
        count: current.count + 1,
        cents: current.cents + total.domainCents,
      });
    }

    return folded;
  }

  /** January to March 2041 in the business calendar; March has no sales. */
  const WINDOW = {
    from: new Date('2041-01-01T00:00:00-03:00'),
    to: new Date('2041-04-01T00:00:00-03:00'),
  };

  describe('over a set of sales built to round', () => {
    const handBuilt: Spec[] = [
      {
        // 120 g of a 1 kg bag at 28.00 is 3.36; 0.25 x 1.14 is an exact tie
        // that a float rounds down.
        createdAt: '2041-01-15T15:00:00Z',
        paymentStatus: 'PENDING',
        productionStatus: 'PENDING',
        lines: [
          ['28.00', 120, 1000],
          ['0.25', 1.14, 1],
        ],
      },
      {
        // The last minute of January in Porto Alegre, already February in UTC.
        createdAt: '2041-02-01T02:59:00Z',
        paymentStatus: 'PAID',
        productionStatus: 'ASSEMBLED',
        lines: [
          ['10.00', 1, 3],
          ['10.00', 1, 3],
          ['10.00', 1, 3],
        ],
      },
      {
        createdAt: '2041-02-10T15:00:00Z',
        paymentStatus: 'PAID',
        productionStatus: 'DELIVERED',
        lines: [
          ['59.90', 0.146, 1],
          ['5.00', 3, 1000],
          ['5.00', 1, 1000],
        ],
      },
      {
        // The first minute of February in Porto Alegre. 7/8 of R$ 1,00 is an
        // exact tie, 87.5 cents.
        createdAt: '2041-02-01T03:00:00Z',
        paymentStatus: 'PENDING',
        productionStatus: 'DELIVERED',
        lines: [['1.00', 7, 8]],
      },
    ];

    /** Deterministic, so a failure is reproducible. */
    function generated(count: number): Spec[] {
      let seed = 20410101;
      const next = (limit: number): number => {
        seed = (seed * 1103515245 + 12345) % 2147483648;
        return seed % limit;
      };
      const payments: PaymentStatus[] = ['PENDING', 'PAID'];
      const productions: ProductionStatus[] = ['PENDING', 'ASSEMBLED', 'DELIVERED'];
      const basisQuantities = [1, 2, 3, 7, 8, 20, 40, 1000];

      return Array.from({ length: count }, () => ({
        // Any day of January or February 2041, at any LOCAL hour, evenings
        // included: those are the ones that are already the next day in UTC.
        createdAt: new Date(
          Date.UTC(2041, next(2), 1 + next(27), next(24) + BUSINESS_OFFSET_HOURS, next(60)),
        ).toISOString(),
        paymentStatus: payments[next(2)],
        productionStatus: productions[next(3)],
        lines: Array.from({ length: 1 + next(4) }, (): Line => [
          `${1 + next(120)}.${String(next(100)).padStart(2, '0')}`,
          (1 + next(3000)) / 1000,
          basisQuantities[next(basisQuantities.length)],
        ]),
      }));
    }

    let ids: string[];
    let dataset: SalesDatasetView;
    let expected: Awaited<ReturnType<typeof totalsFromTheDomain>>;

    beforeAll(async () => {
      ids = [];
      for (const spec of [...handBuilt, ...generated(60)]) {
        ids.push(await record(spec));
      }

      // One sale just outside the window: the last minute of 2040 locally.
      await record({
        createdAt: '2041-01-01T02:59:00Z',
        paymentStatus: 'PAID',
        productionStatus: 'DELIVERED',
        lines: [['999.00', 1, 1]],
      });

      dataset = await analytics.getSalesDataset(WINDOW);
      expected = await totalsFromTheDomain(ids);
    });

    it('agrees with itself: the domain total, the sale-level function and plain integers all match', () => {
      for (const total of expected) {
        expect(total.saleTotalCents).toBe(total.domainCents);
        expect(total.independentCents).toBe(total.domainCents);
      }
    });

    it('matches the domain total exactly in every month, including the empty one', () => {
      const byMonth = foldBy(expected, (total) => total.month);

      expect(dataset.byMonth.map((cell) => cell.month)).toEqual(['2041-01', '2041-02', '2041-03']);

      for (const cell of dataset.byMonth) {
        const wanted = byMonth.get(cell.month) ?? { count: 0, cents: 0 };

        expect(cell.saleCount).toBe(wanted.count);
        expect(Money.fromDecimalString(cell.totalAmount).toCents()).toBe(wanted.cents);
      }
      // A month with no sales is a zero, not an absent row.
      expect(dataset.byMonth[2]).toEqual({ month: '2041-03', saleCount: 0, totalAmount: '0.00' });
    });

    it('matches the domain total exactly for every paymentStatus', () => {
      const byPayment = foldBy(expected, (total) => total.paymentStatus);

      for (const cell of dataset.byPaymentStatus) {
        const wanted = byPayment.get(cell.paymentStatus) ?? { count: 0, cents: 0 };

        expect(cell.saleCount).toBe(wanted.count);
        expect(Money.fromDecimalString(cell.totalAmount).toCents()).toBe(wanted.cents);
      }
    });

    it('matches the domain total exactly for every productionStatus', () => {
      const byProduction = foldBy(expected, (total) => total.productionStatus);

      for (const cell of dataset.byProductionStatus) {
        const wanted = byProduction.get(cell.productionStatus) ?? { count: 0, cents: 0 };

        expect(cell.saleCount).toBe(wanted.count);
        expect(Money.fromDecimalString(cell.totalAmount).toCents()).toBe(wanted.cents);
      }
    });

    it('puts the sale made at 23:59 on 31 January in January, although it is February in UTC', () => {
      // handBuilt[1]: 2041-02-01T02:59Z.
      expect(expected[1].month).toBe('2041-01');
      expect(dataset.byMonth[0].saleCount).toBe(
        expected.filter((total) => total.month === '2041-01').length,
      );
    });

    it('leaves out the sale just before the window', () => {
      const everySale = expected.reduce((sum, total) => sum + total.domainCents, 0);
      const datasetTotal = dataset.byMonth.reduce(
        (sum, cell) => sum + Money.fromDecimalString(cell.totalAmount).toCents(),
        0,
      );

      expect(datasetTotal).toBe(everySale);
    });
  });

  describe('rounding in the wrong order', () => {
    /**
     * Three lines of R$ 10,00 over a basis of 3, one unit each.
     *
     * - CORRECT, 29.97 for three such sales: each line is R$ 3,33 once rounded
     *   to the cent, which is what the detail of the sale shows line by line,
     *   so a sale is 9,99.
     * - WRONG, 30.00: adding the exact fractions first (3 x 3.3333…) and
     *   rounding once at the end. This is what a SUM over the decimal columns
     *   gives, and it disagrees with the lines on the screen by a cent per
     *   sale.
     */
    const TRAP = {
      from: new Date('2042-05-01T00:00:00-03:00'),
      to: new Date('2042-06-01T00:00:00-03:00'),
    };

    it('reports the sum of rounded lines, not the rounding of the sum', async () => {
      for (const day of ['02', '09', '16']) {
        await record({
          createdAt: `2042-05-${day}T15:00:00Z`,
          paymentStatus: 'PAID',
          productionStatus: 'DELIVERED',
          lines: [
            ['10.00', 1, 3],
            ['10.00', 1, 3],
            ['10.00', 1, 3],
          ],
        });
      }

      const dataset = await analytics.getSalesDataset(TRAP);

      // What a SUM in the database followed by one rounding actually returns.
      const [sqlSum] = await prisma.$queryRaw<{ total: string }[]>`
        SELECT ROUND(SUM(i."priceBasisAmount" * i."quantity" / i."priceBasisQuantity"), 2)::text AS total
        FROM "SaleItem" i
        JOIN "Sale" s ON s."id" = i."saleId"
        WHERE s."createdAt" >= ${TRAP.from} AND s."createdAt" < ${TRAP.to}`;

      expect(sqlSum.total).toBe('30.00');

      for (const cell of [
        dataset.byMonth[0],
        dataset.byPaymentStatus.find((c) => c.paymentStatus === 'PAID'),
        dataset.byProductionStatus.find((c) => c.productionStatus === 'DELIVERED'),
      ]) {
        expect(cell?.saleCount).toBe(3);
        expect(cell?.totalAmount).toBe('29.97');
        expect(cell?.totalAmount).not.toBe(sqlSum.total);
      }
    });
  });

  describe('an empty period', () => {
    it('is zeros in every cell, and still lists the month', async () => {
      const dataset = await analytics.getSalesDataset({
        from: new Date('2043-01-01T00:00:00-03:00'),
        to: new Date('2043-02-01T00:00:00-03:00'),
      });

      expect(dataset.byMonth).toEqual([{ month: '2043-01', saleCount: 0, totalAmount: '0.00' }]);
      expect(dataset.byPaymentStatus.map((c) => c.saleCount)).toEqual([0, 0]);
      expect(dataset.byProductionStatus.map((c) => c.saleCount)).toEqual([0, 0, 0]);
    });
  });

  describe('open items', () => {
    const cell = (
      dataset: SalesDatasetView,
      payment: PaymentStatus,
      production: ProductionStatus,
    ) =>
      dataset.openItems.find(
        (open) => open.paymentStatus === payment && open.productionStatus === production,
      );
    const cents = (value: string | undefined): number =>
      Money.fromDecimalString(value ?? '0').toCents();

    it('counts old unpaid and undelivered sales whatever the period asked for', async () => {
      const elsewhere = {
        from: new Date('2044-01-01T00:00:00-03:00'),
        to: new Date('2044-02-01T00:00:00-03:00'),
      };
      const before = await analytics.getSalesDataset(elsewhere);

      await record({
        createdAt: '2024-03-10T15:00:00Z',
        paymentStatus: 'PENDING',
        productionStatus: 'DELIVERED',
        lines: [['12.34', 1, 1]],
      });
      await record({
        createdAt: '2024-03-11T15:00:00Z',
        paymentStatus: 'PAID',
        productionStatus: 'ASSEMBLED',
        lines: [['28.00', 120, 1000]],
      });
      // Paid and delivered is closed and must not appear anywhere in the open cells.
      await record({
        createdAt: '2024-03-12T15:00:00Z',
        paymentStatus: 'PAID',
        productionStatus: 'DELIVERED',
        lines: [['500.00', 1, 1]],
      });

      const after = await analytics.getSalesDataset(elsewhere);

      const owed = [cell(before, 'PENDING', 'DELIVERED'), cell(after, 'PENDING', 'DELIVERED')];
      const inProduction = [cell(before, 'PAID', 'ASSEMBLED'), cell(after, 'PAID', 'ASSEMBLED')];

      expect((owed[1]?.saleCount ?? 0) - (owed[0]?.saleCount ?? 0)).toBe(1);
      expect(cents(owed[1]?.totalAmount) - cents(owed[0]?.totalAmount)).toBe(1234);
      expect((inProduction[1]?.saleCount ?? 0) - (inProduction[0]?.saleCount ?? 0)).toBe(1);
      expect(cents(inProduction[1]?.totalAmount) - cents(inProduction[0]?.totalAmount)).toBe(336);
      expect(after.openItems).toHaveLength(5);
      // None of those sales is in the period asked for.
      expect(after.byMonth[0].saleCount).toBe(0);
    });
  });

  describe('over HTTP', () => {
    it('GET /sales/analytics returns the dataset by dimension', async () => {
      const response = await api(server)
        .get('/sales/analytics')
        .query({ from: '2043-01-01T03:00:00.000Z', to: '2043-02-01T03:00:00.000Z' })
        .set('Authorization', authHeader)
        .expect(HttpStatus.OK);
      const body = response.body as SalesDatasetView;

      expect(Object.keys(body).sort()).toEqual(
        ['byMonth', 'byPaymentStatus', 'byProductionStatus', 'from', 'openItems', 'to'].sort(),
      );
      expect(body.byMonth).toEqual([{ month: '2043-01', saleCount: 0, totalAmount: '0.00' }]);
    });

    it('GET /sales/analytics refuses a request without the whole period', async () => {
      await api(server)
        .get('/sales/analytics')
        .query({ from: '2043-01-01T03:00:00.000Z' })
        .set('Authorization', authHeader)
        .expect(HttpStatus.BAD_REQUEST);
    });
  });
});
