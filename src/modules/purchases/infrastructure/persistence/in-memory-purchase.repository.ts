import type { Purchase } from '../../domain/purchase.entity';
import type { PurchaseItem } from '../../domain/purchase-item.entity';
import type { PurchaseRepository } from '../../domain/repositories/purchase.repository';

/** In-memory `PurchaseRepository` for `application/` tests. Never mocks Prisma. */
export class InMemoryPurchaseRepository implements PurchaseRepository {
  private readonly purchases = new Map<string, Purchase>();
  private readonly items = new Map<string, PurchaseItem>();

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

  async findItemsByPurchaseId(purchaseId: string): Promise<PurchaseItem[]> {
    return Promise.resolve(
      [...this.items.values()].filter((item) => item.purchaseId === purchaseId),
    );
  }

  async saveItems(items: PurchaseItem[]): Promise<void> {
    for (const item of items) {
      this.items.set(item.id, item);
    }
    return Promise.resolve();
  }
}
