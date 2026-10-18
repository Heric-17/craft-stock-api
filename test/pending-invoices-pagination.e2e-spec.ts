import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';

import { HttpStatus, type INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';

import { AppModule } from '../src/app.module';
import type {
  PendingInvoicePageView,
  PendingInvoiceView,
} from '../src/modules/invoices/application/dto/invoices.dto';
import { PrismaService } from '../src/shared/infrastructure/prisma/prisma.service';
import { authenticate } from './support/authenticate';
import { configureTestApp } from './support/configure-test-app';
import { api } from './support/api';

/**
 * `GET /invoices/pending`, paged, against a real database. The captures are
 * written straight to the table so that several share one `createdAt` to the
 * millisecond, which is what proves the tie-break.
 */
describe('GET /invoices/pending pagination (e2e)', () => {
  let app: INestApplication;
  let server: Server;
  let prisma: PrismaService;
  let authHeader: string;
  let actorUserId: string;

  /** Far enough ahead that these sort before anything another suite left behind. */
  const SAME_INSTANT = new Date('2099-01-01T12:00:00.000Z');

  const unstable: string[] = [];
  const queued: string[] = [];
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

    for (const status of ['UNSTABLE', 'PENDING', 'UNSTABLE', 'PENDING', 'UNSTABLE'] as const) {
      const invoice = await prisma.pendingInvoice.create({
        data: {
          id: randomUUID(),
          url: `https://nfce.example/paginacao?p=${randomUUID()}`,
          status,
          createdAt: SAME_INSTANT,
        },
      });
      (status === 'UNSTABLE' ? unstable : queued).push(invoice.id);
      allSeeded.push(invoice.id);
    }
  });

  afterAll(async () => {
    await prisma.pendingInvoice.deleteMany({ where: { id: { in: allSeeded } } });
    await prisma.user.deleteMany({ where: { id: actorUserId } });
    await app.close();
  });

  async function getPage(query: Record<string, string | number>): Promise<PendingInvoicePageView> {
    const response = await api(server)
      .get('/invoices/pending')
      .set('Authorization', authHeader)
      .query(query)
      .expect(HttpStatus.OK);

    return response.body as PendingInvoicePageView;
  }

  async function walk(
    limit: number,
    filter: Record<string, string> = {},
  ): Promise<{ pages: PendingInvoicePageView[]; invoices: PendingInvoiceView[] }> {
    const pages: PendingInvoicePageView[] = [];
    let offset = 0;

    for (;;) {
      const page = await getPage({ ...filter, limit, offset });
      pages.push(page);
      offset += limit;
      if (offset >= page.total) {
        break;
      }
    }

    return { pages, invoices: pages.flatMap((page) => page.items) };
  }

  /** What the order has to be for captures sharing one instant: id, descending. */
  const byIdDescending = (ids: string[]): string[] => [...ids].sort().reverse();

  it('answers with the shape /purchases uses, and the default window', async () => {
    const page = await getPage({});

    expect(Object.keys(page).sort()).toEqual(['items', 'limit', 'offset', 'total']);
    expect(page.limit).toBe(20);
    expect(page.offset).toBe(0);
    expect(page.total).toBeGreaterThanOrEqual(allSeeded.length);
  });

  it('puts the newest first, and breaks a tie on the id', async () => {
    const first = await getPage({ limit: 2, offset: 0 });

    expect(first.items.map((invoice) => invoice.id)).toEqual(byIdDescending(allSeeded).slice(0, 2));
  });

  it('walks the whole queue without repeating or skipping a capture', async () => {
    const { pages, invoices } = await walk(2);
    const ids = invoices.map((invoice) => invoice.id);

    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toHaveLength(pages[0].total);
    expect(ids.filter((id) => allSeeded.includes(id))).toEqual(byIdDescending(allSeeded));
  });

  it('gives the same order whatever the page size', async () => {
    const small = (await walk(2)).invoices.map((invoice) => invoice.id);
    const large = (await walk(5)).invoices.map((invoice) => invoice.id);

    expect(large).toEqual(small);
  });

  it('answers an offset past the total with an empty page and the true total', async () => {
    const { total } = await getPage({});
    const beyond = await getPage({ limit: 10, offset: total + 50 });

    expect(beyond.items).toEqual([]);
    expect(beyond.total).toBe(total);
  });

  it('filters in the query, so the total and the pages describe the filtered set', async () => {
    const { pages, invoices } = await walk(2, { status: 'UNSTABLE' });
    const ids = invoices.map((invoice) => invoice.id);

    expect(invoices.every((invoice) => invoice.status === 'UNSTABLE')).toBe(true);
    expect(ids).toHaveLength(pages[0].total);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.filter((id) => allSeeded.includes(id))).toEqual(byIdDescending(unstable));
    expect(ids.some((id) => queued.includes(id))).toBe(false);
  });

  it('refuses a limit above the ceiling, as /purchases does', async () => {
    await api(server)
      .get('/invoices/pending')
      .set('Authorization', authHeader)
      .query({ limit: 101 })
      .expect(HttpStatus.BAD_REQUEST);
  });

  it('refuses a limit of zero and a negative offset', async () => {
    await api(server)
      .get('/invoices/pending')
      .set('Authorization', authHeader)
      .query({ limit: 0 })
      .expect(HttpStatus.BAD_REQUEST);
    await api(server)
      .get('/invoices/pending')
      .set('Authorization', authHeader)
      .query({ offset: -1 })
      .expect(HttpStatus.BAD_REQUEST);
  });

  it('refuses a status that does not exist', async () => {
    await api(server)
      .get('/invoices/pending')
      .set('Authorization', authHeader)
      .query({ status: 'NOPE' })
      .expect(HttpStatus.BAD_REQUEST);
  });
});
