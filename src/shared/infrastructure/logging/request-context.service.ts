import { AsyncLocalStorage } from 'node:async_hooks';

import { Injectable } from '@nestjs/common';

export interface RequestContext {
  readonly correlationId: string;
}

/**
 * Carries the per-request correlation id through the whole async call stack,
 * so any layer can be traced without threading the id through every signature.
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
}
