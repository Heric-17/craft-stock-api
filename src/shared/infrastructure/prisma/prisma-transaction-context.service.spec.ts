import type { Prisma } from './generated/client';
import { PrismaTransactionContextService } from './prisma-transaction-context.service';

describe('PrismaTransactionContextService', () => {
  const service = new PrismaTransactionContextService();

  it('has no transaction client outside a run', () => {
    expect(service.current).toBeUndefined();
  });

  it('exposes the transaction client inside a run', () => {
    const tx = {} as Prisma.TransactionClient;

    service.run(tx, () => {
      expect(service.current).toBe(tx);
    });
  });

  it('survives asynchronous hops', async () => {
    const tx = {} as Prisma.TransactionClient;

    await service.run(tx, async () => {
      await Promise.resolve();
      await new Promise((resolve) => setTimeout(resolve, 1));

      expect(service.current).toBe(tx);
    });
  });

  it('closes the scope once the run is done', () => {
    const tx = {} as Prisma.TransactionClient;

    service.run(tx, () => undefined);

    expect(service.current).toBeUndefined();
  });

  it('keeps concurrent transactions isolated', async () => {
    const observe = (tx: Prisma.TransactionClient): Promise<Prisma.TransactionClient | undefined> =>
      service.run(tx, async () => {
        await new Promise((resolve) => setTimeout(resolve, 5));

        return service.current;
      });

    const txA = { id: 'a' } as unknown as Prisma.TransactionClient;
    const txB = { id: 'b' } as unknown as Prisma.TransactionClient;

    await expect(Promise.all([observe(txA), observe(txB)])).resolves.toEqual([txA, txB]);
  });
});
