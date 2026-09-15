import { Injectable, type LoggerService } from '@nestjs/common';

import { EnvService } from '../../../config/env.service';
import type { LogLevel } from '../../../config/env.schema';
import { RequestContextService } from './request-context.service';

const SEVERITY: Record<LogLevel, number> = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
  verbose: 4,
};

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: string;
  correlationId?: string;
  stack?: string;
  details?: unknown[];
}

/**
 * Single log sink for the whole application: one JSON object per line on
 * stdout (stderr for errors), always carrying the current correlation id.
 */
@Injectable()
export class StructuredLogger implements LoggerService {
  private readonly threshold: number;

  constructor(
    env: EnvService,
    private readonly requestContext: RequestContextService,
  ) {
    this.threshold = SEVERITY[env.get('LOG_LEVEL')];
  }

  log(message: unknown, ...optionalParams: unknown[]): void {
    this.write('info', message, optionalParams);
  }

  error(message: unknown, ...optionalParams: unknown[]): void {
    this.write('error', message, optionalParams);
  }

  warn(message: unknown, ...optionalParams: unknown[]): void {
    this.write('warn', message, optionalParams);
  }

  debug(message: unknown, ...optionalParams: unknown[]): void {
    this.write('debug', message, optionalParams);
  }

  verbose(message: unknown, ...optionalParams: unknown[]): void {
    this.write('verbose', message, optionalParams);
  }

  fatal(message: unknown, ...optionalParams: unknown[]): void {
    this.write('error', message, optionalParams);
  }

  isLevelEnabled(level: LogLevel): boolean {
    return SEVERITY[level] <= this.threshold;
  }

  private write(level: LogLevel, message: unknown, optionalParams: unknown[]): void {
    if (!this.isLevelEnabled(level)) {
      return;
    }

    const params = [...optionalParams];
    const context = typeof params.at(-1) === 'string' ? (params.pop() as string) : undefined;
    const stack = this.extractStack(message, params);

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message: this.stringify(message),
      ...(context !== undefined ? { context } : {}),
      ...(this.requestContext.correlationId !== undefined
        ? { correlationId: this.requestContext.correlationId }
        : {}),
      ...(stack !== undefined ? { stack } : {}),
      ...(params.length > 0 ? { details: params } : {}),
    };

    const line = `${JSON.stringify(entry)}\n`;
    const stream = level === 'error' ? process.stderr : process.stdout;
    stream.write(line);
  }

  /**
   * Nest calls `error(message, stack, context)`, so the stack can arrive either
   * as a trailing string or attached to a thrown `Error`.
   */
  private extractStack(message: unknown, params: unknown[]): string | undefined {
    if (message instanceof Error) {
      return message.stack;
    }

    const index = params.findIndex((param) => typeof param === 'string' || param instanceof Error);

    if (index === -1) {
      return undefined;
    }

    const [candidate] = params.splice(index, 1);

    return candidate instanceof Error ? candidate.stack : (candidate as string);
  }

  private stringify(message: unknown): string {
    if (typeof message === 'string') {
      return message;
    }

    if (message instanceof Error) {
      return message.message;
    }

    try {
      return JSON.stringify(message) ?? String(message);
    } catch {
      return String(message);
    }
  }
}
