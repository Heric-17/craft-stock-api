import type { Purchase } from '../../domain/purchase.entity';
import type { PurchaseRepository } from '../../domain/repositories/purchase.repository';

/**
 * In-memory `PurchaseRepository` for `application/` tests. Never mocks Prisma.
 *
 * It stores whole aggregates, exactly as the Prisma one does — there is no
 * way to reach a single line through it, because there is no way to reach one
 * through the real repository either.
 */
export class InMemoryPurchaseRepository implements PurchaseRepository {
  private readonly purchases = new Map<string, Purchase>();

  async findById(id: string): Promise<Purchase | null> {
    return Promise.resolve(this.purchases.get(id) ?? null);
  }

  async findByAccessKey(accessKey: string): Promise<Purchase | null> {
    return Promise.resolve(
      [...this.purchases.values()].find((purchase) => purchase.accessKey === accessKey) ?? null,
    );
  }

  async findAll(): Promise<Purchase[]> {
    return Promise.resolve([...this.purchases.values()]);
  }

  async save(purchase: Purchase): Promise<void> {
    this.purchases.set(purchase.id, purchase);
    return Promise.resolve();
  }

  async delete(id: string): Promise<void> {
    this.purchases.delete(id);
    return Promise.resolve();
  }
}
