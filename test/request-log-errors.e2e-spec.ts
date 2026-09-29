import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';

import { Controller, HttpStatus, Inject, Module, Param, Post } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import type { InvestigationView } from '../src/modules/audit-log/application/dto/audit-log.dto';
import { Material } from '../src/modules/materials/domain/material.entity';
import { NOTIFICATION_SENDER_FACTORY } from '../src/shared/domain/notifications/notification-sender';
import { Money } from '../src/shared/domain/money/money';
import { UNIT_OF_WORK, type UnitOfWork } from '../src/shared/domain/persistence/unit-of-work';
import { UnitOfWorkModule } from '../src/shared/infrastructure/persistence/unit-of-work.module';
import { PrismaService } from '../src/shared/infrastructure/prisma/prisma.service';
import type { ErrorResponseBody } from '../src/shared/presentation/filters/all-exceptions.filter';
import { CORRELATION_ID_HEADER } from '../src/shared/presentation/middleware/request-context.middleware';
import { authenticate } from './support/authenticate';

/**
 * A password, a CPF and a token, all planted in the text of a failure on
 * purpose. §16 says none of them may be persisted or logged, and the point of
 * this spec is that the failure record proves it rather than the rule being
 * asserted only against the pure function that applies it.
 */
const PLANTED_PASSWORD = 'correct-horse-battery-staple-9271';
const PLANTED_CPF = '529.982.247-25';
const PLANTED_TOKEN = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1MSJ9.2Sd9Kk';

/**
 * Each route below throws its own class, so each test in this file has an
 * error type of its own and none of them collides with another's alert
 * throttle — the throttle is per errorType and the window is the real one
 * configured for the installation.
 */
class RollbackTestError extends Error {
  constructor() {
    super('deliberate failure after a write inside the transaction');
    this.name = 'RollbackTestError';
  }
}

class CommitThenFailTestError extends Error {
  constructor() {
    super('deliberate failure after the transaction committed');
    this.name = 'CommitThenFailTestError';
  }
}

class CredentialLeakTestError extends Error {
  readonly consumerCpf = PLANTED_CPF;
  readonly passwordHash = `$argon2id$${PLANTED_PASSWORD}`;
  readonly materialName = 'Farinha de trigo';

  constructor() {
    super(
      `login failed for password=${PLANTED_PASSWORD}, cpf=${PLANTED_CPF}, token=${PLANTED_TOKEN}`,
    );
    this.name = 'CredentialLeakTestError';
  }
}

class ThrottleTestError extends Error {
  constructor() {
    super('deliberate repeated failure');
    this.name = 'ThrottleTestError';
  }
}

class AlertFailureTestError extends Error {
  constructor() {
    super('deliberate failure whose alert cannot be delivered');
    this.name = 'AlertFailureTestError';
  }
}

/**
 * Failures that cannot be provoked through a business route: a genuine
 * unhandled error, one that leaves an open transaction to roll back, and one
 * that plants credentials in its own text. It exists only in this spec.
 */
@Controller('__test-observability')
class FailingController {
  constructor(@Inject(UNIT_OF_WORK) private readonly unitOfWork: UnitOfWork) {}

  @Post('rollback/:materialId')
  async rollback(@Param('materialId') materialId: string): Promise<void> {
    await this.unitOfWork.runInTransaction(async (ctx) => {
      await ctx.materials.save(buildMaterial(materialId));

      throw new RollbackTestError();
    });
  }

  @Post('commit-then-fail/:materialId')
  async commitThenFail(@Param('materialId') materialId: string): Promise<void> {
    await this.unitOfWork.runInTransaction(async (ctx) => {
      await ctx.materials.save(buildMaterial(materialId));
    });

    throw new CommitThenFailTestError();
  }

  @Post('leak-credentials')
  leakCredentials(): void {
    throw new CredentialLeakTestError();
  }

  @Post('throttled')
  throttled(): void {
    throw new ThrottleTestError();
  }

  @Post('alert-failure')
  alertFailure(): void {
    throw new AlertFailureTestError();
  }
}

@Module({
  imports: [AppModule, UnitOfWorkModule],
  controllers: [FailingController],
})
class ObservabilityTestModule {}

function buildMaterial(id: string): Material {
  const now = new Date();

  return new Material({
    id,
    name: `Observability Material ${id}`,
    description: null,
    imageUrl: null,
    packageCost: Money.fromDecimalString('10.00'),
    packageQuantity: 1_000,
    consumptionUnit: 'GRAM',
    stockQuantity: 0,
    minimumStockAlert: 0,
    discontinuedAt: null,
    createdAt: now,
    updatedAt: now,
  });
}

interface SentAlert {
  subject: string;
  body: string;
}

/**
 * §15.1/§15.2 end to end: an unhandled failure leaves one request row that
 * says what was attempted, what it wrote and why it failed, reachable by the
 * errorId the caller was handed — and never carries a credential.
 */
describe('Request failure records (e2e)', () => {
  let app: INestApplication;
  let server: Server;
  let prisma: PrismaService;
  let authHeader: string;

  const sentAlerts: SentAlert[] = [];
  const failSendFor = new Set<string>();

  const createdMaterialIds: string[] = [];
  const createdUserIds: string[] = [];
  const usedCorrelationIds: string[] = [];

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [ObservabilityTestModule],
    })
      // The one seam this spec needs: the alert channel. Everything else —
      // the filter, the middleware, the audit extension, Postgres — is real.
      .overrideProvider(NOTIFICATION_SENDER_FACTORY)
      .useValue({
        create: () => ({
          send: (subject: string, body: string): Promise<void> => {
            if ([...failSendFor].some((errorType) => subject.includes(errorType))) {
              return Promise.reject(new Error('the alert channel is down'));
            }

            sentAlerts.push({ subject, body });

            return Promise.resolve();
          },
        }),
      })
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
    server = app.getHttpServer() as Server;
    prisma = moduleRef.get(PrismaService);

    const actor = await authenticate(moduleRef, server);
    authHeader = actor.authHeader;
    createdUserIds.push(actor.userId);
  });

  afterAll(async () => {
    const transactionIds = (
      await prisma.requestLog.findMany({
        where: { correlationId: { in: usedCorrelationIds } },
        select: { transactionId: true },
      })
    ).map((row) => row.transactionId);

    await prisma.auditLog.deleteMany({ where: { transactionId: { in: transactionIds } } });
    await prisma.requestLog.deleteMany({ where: { correlationId: { in: usedCorrelationIds } } });

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

  function nextCorrelationId(): string {
    const correlationId = `e2e-error-${randomUUID()}`;
    usedCorrelationIds.push(correlationId);

    return correlationId;
  }

  function post(path: string, correlationId: string): request.Test {
    return request(server)
      .post(path)
      .set('Authorization', authHeader)
      .set(CORRELATION_ID_HEADER, correlationId);
  }

  /**
   * The request row is written on the response's `finish` event, deliberately
   * outside the business transaction, so it lands a moment after the client
   * already has its answer.
   */
  async function waitForRequestLog(correlationId: string) {
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const row = await prisma.requestLog.findFirst({ where: { correlationId } });

      if (row) {
        return row;
      }

      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    throw new Error(`No RequestLog row was written for correlationId ${correlationId}`);
  }

  describe('a failure inside a transaction that rolls back', () => {
    const correlationId = `e2e-error-rollback-${randomUUID()}`;
    const materialId = randomUUID();

    beforeAll(async () => {
      usedCorrelationIds.push(correlationId);
      await post(`/__test-observability/rollback/${materialId}`, correlationId).expect(
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
      await waitForRequestLog(correlationId);
    });

    it('rolls the write back', async () => {
      await expect(prisma.material.findUnique({ where: { id: materialId } })).resolves.toBeNull();
    });

    /**
     * The whole reason the request row is written outside the business
     * transaction: the rollback erases the audit rows, as it should, and must
     * not erase the record that the attempt happened.
     */
    it('still records the request, with the cause', async () => {
      const row = await waitForRequestLog(correlationId);

      expect(row).toMatchObject({
        route: '/__test-observability/rollback/:materialId',
        httpMethod: 'POST',
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        errorType: 'RollbackTestError',
        errorMessage: 'deliberate failure after a write inside the transaction',
      });
      expect(row.stackTrace).toContain('RollbackTestError');
    });

    it('leaves no audit row behind', async () => {
      const row = await waitForRequestLog(correlationId);

      await expect(
        prisma.auditLog.count({ where: { transactionId: row.transactionId } }),
      ).resolves.toBe(0);
    });
  });

  /**
   * Writing the failure must not itself be auditable, or recording a failure
   * could produce a write that fails.
   */
  it('never audits the request record itself', async () => {
    await expect(
      prisma.auditLog.count({ where: { entityType: { in: ['RequestLog', 'AuditLog'] } } }),
    ).resolves.toBe(0);
  });

  describe('the errorId handed to the caller', () => {
    it('is the correlation id, and is what the request row is found by', async () => {
      const correlationId = nextCorrelationId();

      const response = await post('/__test-observability/throttled', correlationId).expect(
        HttpStatus.INTERNAL_SERVER_ERROR,
      );

      const body = response.body as ErrorResponseBody;
      expect(body.errorId).toBe(correlationId);
      expect(response.headers[CORRELATION_ID_HEADER]).toBe(correlationId);

      const row = await waitForRequestLog(correlationId);
      expect(row.errorId).toBe(correlationId);
      expect(row.correlationId).toBe(correlationId);
    });

    /** The same id in the structured log, which is the primary sink. */
    it('is the correlation id the structured log carries', async () => {
      const correlationId = nextCorrelationId();
      const lines: string[] = [];
      const writeSpy = jest
        .spyOn(process.stderr, 'write')
        .mockImplementation((chunk: string | Uint8Array): boolean => {
          lines.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8'));

          return true;
        });

      try {
        await post('/__test-observability/throttled', correlationId).expect(
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      } finally {
        writeSpy.mockRestore();
      }

      // Only our own lines are JSON; anything else that writes to stderr
      // during the request is ignored rather than allowed to break the parse.
      const logged = lines.flatMap((line) => {
        try {
          return [JSON.parse(line) as { correlationId?: string }];
        } catch {
          return [];
        }
      });

      expect(logged.some((entry) => entry.correlationId === correlationId)).toBe(true);
    });
  });

  describe('sensitive data', () => {
    let row: Awaited<ReturnType<typeof waitForRequestLog>>;
    let logged = '';

    beforeAll(async () => {
      const correlationId = nextCorrelationId();
      const lines: string[] = [];
      const writeSpy = jest.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
        lines.push(String(chunk));

        return true;
      });

      try {
        await post('/__test-observability/leak-credentials', correlationId).expect(
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      } finally {
        writeSpy.mockRestore();
      }

      logged = lines.join('');
      row = await waitForRequestLog(correlationId);
    });

    it.each([PLANTED_PASSWORD, PLANTED_CPF, PLANTED_TOKEN])(
      'never persists %s in any field of the failure record',
      (secret) => {
        expect(JSON.stringify(row)).not.toContain(secret);
      },
    );

    /**
     * §16 covers the log as well as the table, and the log is where an
     * exception's raw stack would otherwise land untouched.
     */
    it.each([PLANTED_PASSWORD, PLANTED_CPF, PLANTED_TOKEN])(
      'never writes %s to the structured log either',
      (secret) => {
        expect(logged).toContain('CredentialLeakTestError');
        expect(logged).not.toContain(secret);
      },
    );

    it('omits a sensitive property of the error by name as well as by value', () => {
      expect(row.errorContext).not.toContain('passwordHash');
      expect(row.errorContext).not.toContain('consumerCpf');
    });

    /** Redacted, not discarded: the record is still worth reading. */
    it('keeps everything that is not sensitive', () => {
      expect(row.errorType).toBe('CredentialLeakTestError');
      expect(row.errorMessage).toContain('[REDACTED]');
      expect(row.errorContext).toContain('Farinha de trigo');
    });
  });

  describe('alerting', () => {
    /**
     * Several requests, one alert. The route is deliberately hit more than
     * once elsewhere in this file too, which is the point: the count is per
     * errorType for the whole window, not per test.
     */
    it('alerts once for a burst of the same error type', async () => {
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const correlationId = nextCorrelationId();
        await post('/__test-observability/throttled', correlationId).expect(
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }

      const alerts = sentAlerts.filter((alert) => alert.subject.includes('ThrottleTestError'));

      expect(alerts).toHaveLength(1);
      expect(alerts[0].body).toContain('ThrottleTestError');
    });

    it('does not throttle a different error type behind the same window', async () => {
      const correlationId = nextCorrelationId();

      await post('/__test-observability/leak-credentials', correlationId).expect(
        HttpStatus.INTERNAL_SERVER_ERROR,
      );

      expect(sentAlerts.some((alert) => alert.subject.includes('CredentialLeakTestError'))).toBe(
        true,
      );
    });

    it('never puts a credential in the alert either', () => {
      const text = JSON.stringify(sentAlerts);

      for (const secret of [PLANTED_PASSWORD, PLANTED_CPF, PLANTED_TOKEN]) {
        expect(text).not.toContain(secret);
      }
    });

    /**
     * An alert is a side effect of the failure. A dead channel must not change
     * the response, and must not stop the failure being recorded.
     */
    it('answers the request and records it even when the alert cannot be sent', async () => {
      failSendFor.add('AlertFailureTestError');
      const correlationId = nextCorrelationId();

      const response = await post('/__test-observability/alert-failure', correlationId).expect(
        HttpStatus.INTERNAL_SERVER_ERROR,
      );

      expect((response.body as ErrorResponseBody).errorId).toBe(correlationId);

      const row = await waitForRequestLog(correlationId);
      expect(row.errorType).toBe('AlertFailureTestError');
    });
  });

  /**
   * The acceptance criterion: one lookup by the errorId the user read off
   * their screen returns the cause, the request, and what it wrote.
   */
  describe('the investigation query', () => {
    it('returns cause, request and writes together', async () => {
      const correlationId = nextCorrelationId();
      const materialId = randomUUID();
      createdMaterialIds.push(materialId);

      await post(`/__test-observability/commit-then-fail/${materialId}`, correlationId).expect(
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
      await waitForRequestLog(correlationId);

      const response = await request(server)
        .get('/audit-log/investigate')
        .query({ errorId: correlationId })
        .set('Authorization', authHeader)
        .expect(HttpStatus.OK);

      const investigation = response.body as InvestigationView;

      expect(investigation.request).toMatchObject({
        correlationId,
        errorId: correlationId,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        errorType: 'CommitThenFailTestError',
        errorMessage: 'deliberate failure after the transaction committed',
      });
      expect(investigation.request?.stackTrace).toContain('CommitThenFailTestError');

      // The write that did commit, under the same transactionId as the
      // request — cause and effect, in one query, with no second lookup.
      expect(
        investigation.writes.some(
          (write) => write.entityType === 'Material' && write.entityId === materialId,
        ),
      ).toBe(true);
    });

    it('answers with an empty investigation for an unknown errorId', async () => {
      const response = await request(server)
        .get('/audit-log/investigate')
        .query({ errorId: randomUUID() })
        .set('Authorization', authHeader)
        .expect(HttpStatus.OK);

      expect(response.body).toEqual({ request: null, writes: [] });
    });
  });
});
