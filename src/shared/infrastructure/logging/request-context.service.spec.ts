import { RequestContextService } from './request-context.service';

describe('RequestContextService', () => {
  const service = new RequestContextService();

  it('has no context outside a run', () => {
    expect(service.current).toBeUndefined();
    expect(service.correlationId).toBeUndefined();
    expect(service.transactionId).toBeUndefined();
    expect(service.userId).toBeUndefined();
    expect(service.intent).toBeUndefined();
  });

  it('exposes the context inside a run', () => {
    service.run({ correlationId: 'abc', transactionId: 'txn-abc' }, () => {
      expect(service.correlationId).toBe('abc');
      expect(service.transactionId).toBe('txn-abc');
    });
  });

  it('survives asynchronous hops', async () => {
    await service.run({ correlationId: 'async-id', transactionId: 'txn-async-id' }, async () => {
      await Promise.resolve();
      await new Promise((resolve) => setTimeout(resolve, 1));

      expect(service.correlationId).toBe('async-id');
      expect(service.transactionId).toBe('txn-async-id');
    });
  });

  it('keeps concurrent runs isolated', async () => {
    const observe = (id: string): Promise<string | undefined> =>
      service.run({ correlationId: id, transactionId: `txn-${id}` }, async () => {
        await new Promise((resolve) => setTimeout(resolve, 5));

        return service.correlationId;
      });

    await expect(Promise.all([observe('one'), observe('two')])).resolves.toEqual(['one', 'two']);
  });

  it('lets later code fill in userId once the context is open', () => {
    service.run({ correlationId: 'with-user', transactionId: 'txn-with-user' }, () => {
      expect(service.userId).toBeUndefined();

      service.setUserId('user-1');

      expect(service.userId).toBe('user-1');
      expect(service.current?.userId).toBe('user-1');
    });
  });

  it('lets a service set an optional intent', () => {
    service.run({ correlationId: 'with-intent', transactionId: 'txn-with-intent' }, () => {
      service.setIntent('discount_reallocation');

      expect(service.intent).toBe('discount_reallocation');
    });
  });

  it('lets the auth guard fill in route and httpMethod', () => {
    service.run({ correlationId: 'with-route', transactionId: 'txn-with-route' }, () => {
      expect(service.route).toBeUndefined();
      expect(service.httpMethod).toBeUndefined();

      service.setRoute('PATCH', '/materials/:id');

      expect(service.httpMethod).toBe('PATCH');
      expect(service.route).toBe('/materials/:id');
    });
  });

  it('setUserId, setIntent and setRoute outside a run are no-ops, not throws', () => {
    expect(() => service.setUserId('orphan')).not.toThrow();
    expect(() => service.setIntent('orphan')).not.toThrow();
    expect(() => service.setRoute('GET', '/orphan')).not.toThrow();
  });

  it('keeps userId isolated between concurrent runs', async () => {
    const observe = (id: string): Promise<string | undefined> =>
      service.run({ correlationId: id, transactionId: `txn-${id}` }, async () => {
        service.setUserId(`user-${id}`);
        await new Promise((resolve) => setTimeout(resolve, 5));

        return service.userId;
      });

    await expect(Promise.all([observe('one'), observe('two')])).resolves.toEqual([
      'user-one',
      'user-two',
    ]);
  });
});
