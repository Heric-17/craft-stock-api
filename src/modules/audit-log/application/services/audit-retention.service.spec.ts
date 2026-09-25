import type { ConfigService } from '@nestjs/config';

import { EnvService } from '../../../../config/env.service';
import type { Env } from '../../../../config/env.schema';
import { StructuredLogger } from '../../../../shared/infrastructure/logging/structured-logger.service';
import { RequestContextService } from '../../../../shared/infrastructure/logging/request-context.service';
import type { AuditRetentionPruner } from '../../domain/audit-retention-pruner';
import { AuditRetentionService } from './audit-retention.service';

const BASE_ENV: Env = {
  NODE_ENV: 'test',
  PORT: 3000,
  LOG_LEVEL: 'info',
  DATABASE_URL: 'postgresql://localhost:5432/craftstock',
  NFCE_PROVIDER: 'AUTO',
  NFCE_IMPORT_MAX_ATTEMPTS: 3,
  NFCE_IMPORT_RETRY_DELAY_MS: 1_000,
  JWT_SECRET: 'a'.repeat(32),
  JWT_EXPIRES_IN_SECONDS: 900,
  REFRESH_TOKEN_EXPIRES_IN_SECONDS: 2_592_000,
  ARGON2_TIME_COST: 3,
  AUDIT_LOG_RETENTION_DAYS: 180,
  REQUEST_LOG_RETENTION_DAYS: 30,
};

function envService(overrides: Partial<Env> = {}): EnvService {
  const values = { ...BASE_ENV, ...overrides };
  const config = { get: (key: keyof Env) => values[key] } as unknown as ConfigService<Env, true>;
  return new EnvService(config);
}

class FakePruner implements AuditRetentionPruner {
  auditLogCalls: Date[] = [];
  requestLogCalls: Date[] = [];

  pruneAuditLog(olderThan: Date): Promise<number> {
    this.auditLogCalls.push(olderThan);
    return Promise.resolve(3);
  }

  pruneRequestLog(olderThan: Date): Promise<number> {
    this.requestLogCalls.push(olderThan);
    return Promise.resolve(7);
  }
}

function buildLogger(): StructuredLogger {
  const requestContext = new RequestContextService();
  return new StructuredLogger(envService(), requestContext);
}

describe('AuditRetentionService', () => {
  it('prunes AuditLog and RequestLog using their own independent windows', async () => {
    const pruner = new FakePruner();
    const service = new AuditRetentionService(pruner, envService(), buildLogger());

    const now = new Date('2026-06-30T00:00:00.000Z');
    const result = await service.pruneOlderThan(now);

    expect(result).toEqual({ auditLogDeleted: 3, requestLogDeleted: 7 });

    const auditCutoff = pruner.auditLogCalls[0];
    const requestCutoff = pruner.requestLogCalls[0];

    const daysBetween = (a: Date, b: Date): number =>
      Math.round((a.getTime() - b.getTime()) / (24 * 60 * 60 * 1000));

    expect(daysBetween(now, auditCutoff)).toBe(180);
    expect(daysBetween(now, requestCutoff)).toBe(30);
  });

  it('respects configured retention windows', async () => {
    const pruner = new FakePruner();
    const service = new AuditRetentionService(
      pruner,
      envService({ AUDIT_LOG_RETENTION_DAYS: 10, REQUEST_LOG_RETENTION_DAYS: 2 }),
      buildLogger(),
    );

    const now = new Date('2026-06-30T00:00:00.000Z');
    await service.pruneOlderThan(now);

    const daysBetween = (a: Date, b: Date): number =>
      Math.round((a.getTime() - b.getTime()) / (24 * 60 * 60 * 1000));

    expect(daysBetween(now, pruner.auditLogCalls[0])).toBe(10);
    expect(daysBetween(now, pruner.requestLogCalls[0])).toBe(2);
  });

  it('defaults to the current time when no "now" is given', async () => {
    const pruner = new FakePruner();
    const service = new AuditRetentionService(pruner, envService(), buildLogger());

    const before = Date.now();
    await service.pruneOlderThan();
    const after = Date.now();

    const cutoffMs = pruner.auditLogCalls[0].getTime();
    const expectedWindowMs = 180 * 24 * 60 * 60 * 1000;

    expect(cutoffMs).toBeGreaterThanOrEqual(before - expectedWindowMs - 1000);
    expect(cutoffMs).toBeLessThanOrEqual(after - expectedWindowMs + 1000);
  });
});
