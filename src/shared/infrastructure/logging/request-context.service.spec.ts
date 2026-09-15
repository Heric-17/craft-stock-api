import { RequestContextService } from './request-context.service';

describe('RequestContextService', () => {
  const service = new RequestContextService();

  it('has no context outside a run', () => {
    expect(service.current).toBeUndefined();
    expect(service.correlationId).toBeUndefined();
  });

  it('exposes the context inside a run', () => {
    service.run({ correlationId: 'abc' }, () => {
      expect(service.correlationId).toBe('abc');
    });
  });

  it('survives asynchronous hops', async () => {
    await service.run({ correlationId: 'async-id' }, async () => {
      await Promise.resolve();
      await new Promise((resolve) => setTimeout(resolve, 1));

      expect(service.correlationId).toBe('async-id');
    });
  });

  it('keeps concurrent runs isolated', async () => {
    const observe = (id: string): Promise<string | undefined> =>
      service.run({ correlationId: id }, async () => {
        await new Promise((resolve) => setTimeout(resolve, 5));

        return service.correlationId;
      });

    await expect(Promise.all([observe('one'), observe('two')])).resolves.toEqual(['one', 'two']);
  });
});
