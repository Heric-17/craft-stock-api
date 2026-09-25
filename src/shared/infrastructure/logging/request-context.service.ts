import { AsyncLocalStorage } from 'node:async_hooks';

import { Injectable } from '@nestjs/common';

export interface RequestContext {
  readonly correlationId: string;
  /**
   * Groups every write made during this request (and the RequestLog row for
   * the request itself) under one id. Not a Postgres transaction id — see
   * CLAUDE.md §15.2.
   */
  readonly transactionId: string;
  /** Unset until the auth guard resolves a principal; stays unset on `@Public()` routes. */
  userId?: string;
  /** Set by a service right before a write whose intent the diff alone can't distinguish. */
  intent?: string;
  /**
   * Route pattern (e.g. `/materials/:id`) and HTTP method. Set by the global
   * auth guard rather than the request-opening middleware: Express only
   * populates `req.route` once it has matched and dispatched to the specific
   * route, which happens before Nest's guard pipeline runs but after the
   * outer middleware body executes. The audit extension needs these and has
   * no access to the HTTP request at all.
   */
  route?: string;
  httpMethod?: string;
}

/**
 * Carries per-request state through the whole async call stack, so any layer
 * can read it without threading it through every signature. The stored
 * object is mutable in place: `correlationId`/`transactionId` are fixed for
 * the request, but `userId` and `intent` are filled in later by code running
 * inside the same `run()` — the auth guard and, occasionally, an application
 * service — since both run after the context is opened.
 */
@Injectable()
export class RequestContextService {
  private readonly storage = new AsyncLocalStorage<RequestContext>();

  run<T>(context: RequestContext, callback: () => T): T {
    return this.storage.run(context, callback);
  }

  get current(): RequestContext | undefined {
    return this.storage.getStore();
  }

  get correlationId(): string | undefined {
    return this.storage.getStore()?.correlationId;
  }

  get transactionId(): string | undefined {
    return this.storage.getStore()?.transactionId;
  }

  get userId(): string | undefined {
    return this.storage.getStore()?.userId;
  }

  get intent(): string | undefined {
    return this.storage.getStore()?.intent;
  }

  get route(): string | undefined {
    return this.storage.getStore()?.route;
  }

  get httpMethod(): string | undefined {
    return this.storage.getStore()?.httpMethod;
  }

  setUserId(userId: string): void {
    const store = this.storage.getStore();
    if (store) {
      store.userId = userId;
    }
  }

  setIntent(intent: string): void {
    const store = this.storage.getStore();
    if (store) {
      store.intent = intent;
    }
  }

  setRoute(httpMethod: string, route: string): void {
    const store = this.storage.getStore();
    if (store) {
      store.httpMethod = httpMethod;
      store.route = route;
    }
  }
}
