export const REQUEST_LOG_WRITER = Symbol('REQUEST_LOG_WRITER');

export interface RequestLogEntry {
  transactionId: string;
  route: string;
  httpMethod: string;
  userId: string | null;
  correlationId: string;
  statusCode: number;
  durationMs: number;
  errorId: string | null;
}

/**
 * §15.2: writes the one `RequestLog` row for a mutating request. Its own
 * port, not folded into a repository — `presentation/` (the middleware that
 * calls it) must never know the ORM's transaction client type exists, so the
 * dependency has to be an interface regardless of how small the
 * implementation is.
 */
export interface RequestLogWriter {
  write(entry: RequestLogEntry): Promise<void>;
}
