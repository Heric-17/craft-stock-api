import type { ConfigService } from '@nestjs/config';

import { EnvService } from '../../../config/env.service';
import type { Env, LogLevel } from '../../../config/env.schema';
import { RequestContextService } from './request-context.service';
import { StructuredLogger, type LogEntry } from './structured-logger.service';

function envWithLogLevel(level: LogLevel): EnvService {
  const values: Env = {
    NODE_ENV: 'test',
    PORT: 3000,
    LOG_LEVEL: level,
    DATABASE_URL: 'postgresql://localhost:5432/craftstock',
    NFCE_PROVIDER: 'AUTO',
    NFCE_IMPORT_MAX_ATTEMPTS: 3,
    NFCE_IMPORT_RETRY_DELAY_MS: 1_000,
  };

  const config = {
    get: <K extends keyof Env>(key: K): Env[K] => values[key],
  } as ConfigService<Env, true>;

  return new EnvService(config);
}

describe('StructuredLogger', () => {
  let requestContext: RequestContextService;
  let stdout: string[];
  let stderr: string[];

  beforeEach(() => {
    requestContext = new RequestContextService();
    stdout = [];
    stderr = [];

    jest.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown): boolean => {
      stdout.push(chunk as string);

      return true;
    });

    jest.spyOn(process.stderr, 'write').mockImplementation((chunk: unknown): boolean => {
      stderr.push(chunk as string);

      return true;
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  function lastEntry(lines: string[]): LogEntry {
    return JSON.parse(lines.at(-1) ?? '') as LogEntry;
  }

  it('writes one JSON object per line on stdout', () => {
    const logger = new StructuredLogger(envWithLogLevel('info'), requestContext);

    logger.log('material created', 'MaterialService');

    expect(stdout.at(-1)?.endsWith('\n')).toBe(true);
    const entry = lastEntry(stdout);
    expect(entry).toMatchObject({
      level: 'info',
      message: 'material created',
      context: 'MaterialService',
    });
    expect(Date.parse(entry.timestamp)).not.toBeNaN();
  });

  it('carries the correlation id of the surrounding request', () => {
    const logger = new StructuredLogger(envWithLogLevel('info'), requestContext);

    requestContext.run({ correlationId: 'abc-123' }, () => {
      logger.log('inside a request');
    });

    expect(lastEntry(stdout).correlationId).toBe('abc-123');
  });

  it('omits the correlation id outside a request', () => {
    const logger = new StructuredLogger(envWithLogLevel('info'), requestContext);

    logger.log('outside a request');

    expect(lastEntry(stdout).correlationId).toBeUndefined();
  });

  it('sends errors to stderr with the stack trace', () => {
    const logger = new StructuredLogger(envWithLogLevel('info'), requestContext);
    const failure = new Error('boom');

    logger.error(failure.message, failure.stack, 'PrismaService');

    expect(stdout).toHaveLength(0);

    const entry = lastEntry(stderr);
    expect(entry).toMatchObject({ level: 'error', message: 'boom', context: 'PrismaService' });
    expect(entry.stack).toContain('Error: boom');
  });

  it('drops entries below the configured level', () => {
    const logger = new StructuredLogger(envWithLogLevel('warn'), requestContext);

    logger.debug('noisy');
    logger.log('routine');

    expect(stdout).toHaveLength(0);

    logger.warn('worth knowing');
    expect(lastEntry(stdout).level).toBe('warn');
  });

  it('keeps extra parameters as details', () => {
    const logger = new StructuredLogger(envWithLogLevel('info'), requestContext);

    logger.log('imported', { items: 3 }, 'NFCeImportFacade');

    expect(lastEntry(stdout).details).toEqual([{ items: 3 }]);
  });
});
