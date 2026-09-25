import type { Server } from 'node:http';

import { HttpStatus, type INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import type { LoginResult } from '../src/modules/auth/application/dto/auth.dto';
import type { MaterialView } from '../src/modules/materials/application/dto/materials.dto';
import type { SaleView } from '../src/modules/sales/application/dto/sales.dto';
import { UsersService } from '../src/modules/users/application/services/users.service';
import { PrismaService } from '../src/shared/infrastructure/prisma/prisma.service';
import { authenticate } from './support/authenticate';

/**
 * End-to-end coverage of §15.2's automatic audit capture, driven over real
 * HTTP against the real app and real Postgres (never mocked). The one fact
 * that the pre-read mechanism actually shares a transaction with the
 * triggering write is pinned down separately, at a lower level, in
 * `audit-transaction-propagation.e2e-spec.ts` — this file exercises the
 * feature the way a real client actually would.
 */
describe('Audit trail (e2e)', () => {
  let app: INestApplication;
  let server: Server;
  let prisma: PrismaService;
  let authHeader: string;
  let actorUserId: string;

  const createdMaterialIds: string[] = [];
  const createdSaleIds: string[] = [];
  const createdUserIds: string[] = [];

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
    server = app.getHttpServer() as Server;
    prisma = moduleRef.get(PrismaService);
    ({ authHeader, userId: actorUserId } = await authenticate(moduleRef, server));
    createdUserIds.push(actorUserId);
  });

  afterAll(async () => {
    for (const saleId of createdSaleIds) {
      await prisma.stockMovementSnapshot.deleteMany({ where: { saleId } });
      await prisma.saleItem.deleteMany({ where: { saleId } });
      await prisma.sale.deleteMany({ where: { id: saleId } });
    }
    for (const materialId of createdMaterialIds) {
      await prisma.materialPriceHistory.deleteMany({ where: { materialId } });
      await prisma.material.deleteMany({ where: { id: materialId } });
    }
    for (const userId of createdUserIds) {
      await prisma.refreshToken.deleteMany({ where: { userId } });
      await prisma.user.deleteMany({ where: { id: userId } });
    }
    await app.close();
  });

  async function createMaterial(overrides: Record<string, unknown> = {}): Promise<MaterialView> {
    const created = await request(server)
      .post('/materials')
      .set('Authorization', authHeader)
      .send({
        name: `Audit Material ${Date.now()}-${Math.random()}`,
        packageCost: '10.00',
        packageQuantity: 1000,
        consumptionUnit: 'GRAM',
        stockQuantity: 500,
        minimumStockAlert: 0,
        ...overrides,
      })
      .expect(HttpStatus.CREATED);

    const material = created.body as MaterialView;
    createdMaterialIds.push(material.id);
    return material;
  }

  it('audits a CREATE and writes a matching RequestLog row', async () => {
    const material = await createMaterial();

    const auditRows = await prisma.auditLog.findMany({
      where: { entityType: 'Material', entityId: material.id, operation: 'CREATE' },
    });

    expect(auditRows).toHaveLength(1);
    const [row] = auditRows;
    expect(row.entityLabel).toBe(material.name);
    expect(row.userId).toBe(actorUserId);
    expect(row.httpMethod).toBe('POST');
    expect(row.route).toBe('/materials');
    const changes = row.changes as Record<string, { old: unknown; new: unknown }>;
    expect(changes.name).toEqual({ old: null, new: material.name });

    const requestLog = await prisma.requestLog.findUnique({
      where: { transactionId: row.transactionId },
    });
    expect(requestLog).toMatchObject({
      route: '/materials',
      httpMethod: 'POST',
      userId: actorUserId,
      statusCode: HttpStatus.CREATED,
      errorId: null,
    });
    expect(requestLog?.correlationId).toBe(row.correlationId);
  });

  it('audits an UPDATE with only the changed field, and a no-op PATCH writes nothing', async () => {
    const material = await createMaterial({ description: 'original description' });

    await request(server)
      .patch(`/materials/${material.id}`)
      .set('Authorization', authHeader)
      .send({ description: 'updated description' })
      .expect(HttpStatus.OK);

    const updateRows = await prisma.auditLog.findMany({
      where: { entityType: 'Material', entityId: material.id, operation: 'UPDATE' },
    });
    expect(updateRows).toHaveLength(1);
    const changes = updateRows[0].changes as Record<string, { old: unknown; new: unknown }>;
    expect(changes).toEqual({
      description: { old: 'original description', new: 'updated description' },
    });
    expect(changes).not.toHaveProperty('name');
    expect(changes).not.toHaveProperty('packageCost');

    // Same value sent again: the diff is empty, so no second UPDATE row.
    await request(server)
      .patch(`/materials/${material.id}`)
      .set('Authorization', authHeader)
      .send({ description: 'updated description' })
      .expect(HttpStatus.OK);

    const afterNoOp = await prisma.auditLog.findMany({
      where: { entityType: 'Material', entityId: material.id, operation: 'UPDATE' },
    });
    expect(afterNoOp).toHaveLength(1);
  });

  it('audits a write from an unauthenticated request with userId null, redacts the sensitive field, and leaves entityLabel null for an unmapped model', async () => {
    const email = `audit-e2e-${Date.now()}@craftstock.dev`;
    const password = 'correct horse battery staple';
    const user = await app.get(UsersService).register({ email, password, name: 'Audit E2E User' });
    createdUserIds.push(user.id);

    const loginResponse = await request(server)
      .post('/auth/login')
      .send({ email, password })
      .expect(HttpStatus.OK);

    const body = loginResponse.body as LoginResult;
    expect(body.accessToken).toBeTruthy();

    const auditRows = await prisma.auditLog.findMany({
      where: { entityType: 'RefreshToken', userId: null, operation: 'CREATE' },
      orderBy: { occurredAt: 'desc' },
      take: 5,
    });

    // The refresh token minted by *this* login: identified by recency since
    // RefreshToken has no field this test can filter by directly.
    expect(auditRows.length).toBeGreaterThan(0);
    const row = auditRows[0];

    expect(row.userId).toBeNull();
    expect(row.entityLabel).toBeNull(); // RefreshToken is absent from the entity-label map.
    const changes = row.changes as Record<string, unknown>;
    expect(changes).not.toHaveProperty('tokenHash');
    expect(JSON.stringify(changes)).not.toContain(body.accessToken.slice(0, 10));
  });

  it('shares one transactionId across every write a multi-write request makes', async () => {
    const material = await createMaterial({ stockQuantity: 1000 });

    const saleCreated = await request(server)
      .post('/sales')
      .set('Authorization', authHeader)
      .send({
        customerName: 'Audit Trail Buyer',
        paymentMethod: 'PIX',
        items: [{ materialId: material.id, quantity: 100, marginPercent: 20 }],
      })
      .expect(HttpStatus.CREATED);

    const sale = saleCreated.body as SaleView;
    createdSaleIds.push(sale.id);

    const assembled = await request(server)
      .patch(`/sales/${sale.id}/production-status`)
      .set('Authorization', authHeader)
      .send({ productionStatus: 'ASSEMBLED' })
      .expect(HttpStatus.OK);

    void assembled;

    const requestLog = await prisma.requestLog.findFirst({
      where: { route: '/sales/:id/production-status', httpMethod: 'PATCH' },
      orderBy: { occurredAt: 'desc' },
    });
    expect(requestLog).not.toBeNull();

    const writes = await prisma.auditLog.findMany({
      where: { transactionId: requestLog!.transactionId },
    });

    const touchedEntityTypes = new Set(writes.map((w) => w.entityType));
    expect(touchedEntityTypes).toEqual(new Set(['Sale', 'StockMovementSnapshot', 'Material']));
    expect(writes.every((w) => w.transactionId === requestLog!.transactionId)).toBe(true);
  });

  it('resolves an investigation by transactionId and by correlationId to the same result', async () => {
    const material = await createMaterial();

    const auditRow = await prisma.auditLog.findFirstOrThrow({
      where: { entityType: 'Material', entityId: material.id, operation: 'CREATE' },
    });

    const byTransactionId = await request(server)
      .get('/audit-log/investigate')
      .set('Authorization', authHeader)
      .query({ transactionId: auditRow.transactionId })
      .expect(HttpStatus.OK);

    const byCorrelationId = await request(server)
      .get('/audit-log/investigate')
      .set('Authorization', authHeader)
      .query({ correlationId: auditRow.correlationId })
      .expect(HttpStatus.OK);

    for (const response of [byTransactionId, byCorrelationId]) {
      const payload = response.body as {
        request: { transactionId: string } | null;
        writes: unknown[];
      };
      expect(payload.request?.transactionId).toBe(auditRow.transactionId);
      expect(
        (payload.writes as Array<{ entityId: string; operation: string }>).some(
          (w) => w.entityId === material.id && w.operation === 'CREATE',
        ),
      ).toBe(true);
    }
  });

  it('rejects an investigation with no key at all', async () => {
    await request(server)
      .get('/audit-log/investigate')
      .set('Authorization', authHeader)
      .expect(HttpStatus.BAD_REQUEST);
  });
});
