import { establishmentIdOf } from '../../domain/establishment';
import type { Purchase } from '../../domain/purchase.entity';
import type {
  PurchaseListQuery,
  PurchasePage,
  PurchaseRepository,
} from '../../domain/repositories/purchase.repository';

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

  /** Same order and same filters as the Prisma one: newest first, ties broken on id. */
  async findPage(query: PurchaseListQuery): Promise<PurchasePage> {
    const matching = [...this.purchases.values()]
      .filter((purchase) => matches(purchase, query))
      .sort(
        (a, b) => b.purchaseDate.getTime() - a.purchaseDate.getTime() || b.id.localeCompare(a.id),
      );

    return Promise.resolve({
      purchases: matching.slice(query.offset, query.offset + query.limit),
      total: matching.length,
      limit: query.limit,
      offset: query.offset,
    });
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

function matches(purchase: Purchase, query: PurchaseListQuery): boolean {
  if (query.from !== undefined && purchase.purchaseDate < query.from) {
    return false;
  }

  if (query.to !== undefined && purchase.purchaseDate >= query.to) {
    return false;
  }

  if (query.establishmentId === undefined) {
    return true;
  }

  return (
    establishmentIdOf(
      purchase.establishment?.name ?? null,
      purchase.establishment?.cnpj ?? null,
    ) === query.establishmentId
  );
}
