import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';

import { HttpStatus, type INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import type { SalePageView, SaleView } from '../src/modules/sales/application/dto/sales.dto';
import { PrismaService } from '../src/shared/infrastructure/prisma/prisma.service';
import { authenticate } from './support/authenticate';
import { configureTestApp } from './support/configure-test-app';

/**
 * `GET /sales`, paged, against a real database. The sales are written straight
 * to the table so that several of them can share one `createdAt` to the
 * millisecond, which is the only way to prove the tie-break rather than hope
 * the clock happens to separate them.
 */
describe('GET /sales pagination (e2e)', () => {
  let app: INestApplication;
  let server: Server;
  let prisma: PrismaService;
  let authHeader: string;
  let actorUserId: string;

  /** Far enough ahead that these sort before anything another suite left behind. */
  const SAME_INSTANT = new Date('2099-01-01T12:00:00.000Z');

  const paid: string[] = [];
  const pending: string[] = [];
  const allSeeded: string[] = [];

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    configureTestApp(app, moduleRef);
    await app.init();
    server = app.getHttpServer() as Server;
    prisma = moduleRef.get(PrismaService);
    ({ authHeader, userId: actorUserId } = await authenticate(moduleRef, server));

    // Five sales at the very same instant: three paid, two not.
    for (const paymentStatus of ['PAID', 'PENDING', 'PAID', 'PENDING', 'PAID'] as const) {
      const sale = await prisma.sale.create({
        data: {
          id: randomUUID(),
          customerName: 'Cliente da paginação',
          paymentMethod: 'PIX',
          paymentStatus,
          createdAt: SAME_INSTANT,
        },
      });
      (paymentStatus === 'PAID' ? paid : pending).push(sale.id);
      allSeeded.push(sale.id);
    }
  });

  afterAll(async () => {
    await prisma.sale.deleteMany({ where: { id: { in: allSeeded } } });
    await prisma.user.deleteMany({ where: { id: actorUserId } });
    await app.close();
  });

  async function getPage(query: Record<string, string | number>): Promise<SalePageView> {
    const response = await request(server)
      .get('/sales')
      .set('Authorization', authHeader)
      .query(query)
      .expect(HttpStatus.OK);

    return response.body as SalePageView;
  }

  /** Every page in turn, until the offset passes the total. */
  async function walk(
    limit: number,
    filter: Record<string, string> = {},
  ): Promise<{ pages: SalePageView[]; sales: SaleView[] }> {
    const pages: SalePageView[] = [];
    let offset = 0;

    for (;;) {
      const page = await getPage({ ...filter, limit, offset });
      pages.push(page);
      offset += limit;
      if (offset >= page.total) {
        break;
      }
    }

    return { pages, sales: pages.flatMap((page) => page.items) };
  }

  /** What the order has to be for sales sharing one instant: id, descending. */
  const byIdDescending = (ids: string[]): string[] => [...ids].sort().reverse();

  it('answers with the shape /purchases uses, and the default window', async () => {
    const page = await getPage({});

    expect(Object.keys(page).sort()).toEqual(['items', 'limit', 'offset', 'total']);
    expect(page.limit).toBe(20);
    expect(page.offset).toBe(0);
    expect(page.total).toBeGreaterThanOrEqual(allSeeded.length);
    expect(page.items.length).toBeLessThanOrEqual(20);
  });

  it('puts the newest first, and breaks a tie on the id', async () => {
    const first = await getPage({ limit: 2, offset: 0 });

    expect(first.items).toHaveLength(2);
    expect(first.items.map((sale) => sale.id)).toEqual(byIdDescending(allSeeded).slice(0, 2));
  });

  it('walks the whole history without repeating or skipping a sale', async () => {
    const { pages, sales } = await walk(2);
    const ids = sales.map((sale) => sale.id);

    // Not one id twice, and the pages add up to exactly the size of the set.
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toHaveLength(pages[0].total);

    // Every sale seeded at the same instant is reachable, in the tie-break order.
    expect(ids.filter((id) => allSeeded.includes(id))).toEqual(byIdDescending(allSeeded));
  });

  it('gives the same order whatever the page size', async () => {
    const small = (await walk(2)).sales.map((sale) => sale.id);
    const large = (await walk(5)).sales.map((sale) => sale.id);

    expect(large).toEqual(small);
  });

  it('answers an offset past the total with an empty page and the true total', async () => {
    const { total } = await getPage({});
    const beyond = await getPage({ limit: 10, offset: total + 50 });

    expect(beyond.items).toEqual([]);
    expect(beyond.total).toBe(total);
    expect(beyond.offset).toBe(total + 50);
  });

  it('filters in the query, so the total and the pages describe the filtered set', async () => {
    const { pages, sales } = await walk(2, { paymentStatus: 'PAID' });
    const ids = sales.map((sale) => sale.id);

    expect(sales.every((sale) => sale.paymentStatus === 'PAID')).toBe(true);
    expect(ids).toHaveLength(pages[0].total);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.filter((id) => allSeeded.includes(id))).toEqual(byIdDescending(paid));
    expect(ids.some((id) => pending.includes(id))).toBe(false);
  });

  it('refuses a limit above the ceiling, as /purchases does', async () => {
    await request(server)
      .get('/sales')
      .set('Authorization', authHeader)
      .query({ limit: 101 })
      .expect(HttpStatus.BAD_REQUEST);
  });

  it('refuses a limit of zero and a negative offset', async () => {
    await request(server)
      .get('/sales')
      .set('Authorization', authHeader)
      .query({ limit: 0 })
      .expect(HttpStatus.BAD_REQUEST);
    await request(server)
      .get('/sales')
      .set('Authorization', authHeader)
      .query({ offset: -1 })
      .expect(HttpStatus.BAD_REQUEST);
  });

  it('accepts the ceiling itself', async () => {
    const page = await getPage({ limit: 100 });

    expect(page.limit).toBe(100);
  });

  it('leaves the analytics dataset alone: it still counts every sale of the period, not a page', async () => {
    const response = await request(server)
      .get('/sales/analytics')
      .set('Authorization', authHeader)
      .query({ from: '2099-01-01T00:00:00.000Z', to: '2099-02-01T00:00:00.000Z' })
      .expect(HttpStatus.OK);
    const body = response.body as { byMonth: { month: string; saleCount: number }[] };

    // More sales than the smallest page the list could have been asked for.
    expect(body.byMonth.find((cell) => cell.month === '2099-01')?.saleCount).toBeGreaterThanOrEqual(
      allSeeded.length,
    );
  });
});
