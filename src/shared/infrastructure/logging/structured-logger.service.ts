import { Injectable, type LoggerService } from '@nestjs/common';

import { EnvService } from '../../../config/env.service';
import type { LogLevel } from '../../../config/env.schema';
import { redactSensitiveText } from '../../domain/observability/sensitive-data';
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
 *
 * Being the single sink is also what makes it the right place to apply §16:
 * every message, stack and string argument goes through
 * `redactSensitiveText` on the way out. A password or a CPF reaches a log
 * mostly by accident — inside the text of an exception thrown three layers
 * away — so the guarantee cannot rest on each call site remembering. Here it
 * holds for every caller, including the ones added later.
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
      message: redactSensitiveText(this.stringify(message)),
      ...(context !== undefined ? { context } : {}),
      ...(this.requestContext.correlationId !== undefined
        ? { correlationId: this.requestContext.correlationId }
        : {}),
      ...(stack !== undefined ? { stack: redactSensitiveText(stack) } : {}),
      ...(params.length > 0 ? { details: params.map(redactDetail) } : {}),
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

/**
 * Extra arguments are redacted when they are text, which is what they are in
 * practice. Anything else is left as it is: guessing at the shape of an
 * arbitrary object would be a worse guarantee than the rule that sensitive
 * data does not get handed to the logger as a structure in the first place.
 */
function redactDetail(detail: unknown): unknown {
  return typeof detail === 'string' ? redactSensitiveText(detail) : detail;
}
