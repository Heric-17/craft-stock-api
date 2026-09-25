import { Inject, Injectable } from '@nestjs/common';

import { PRISMA_CLIENT } from '../../../../shared/infrastructure/prisma/prisma-client.token';
import type { Prisma } from '../../../../shared/infrastructure/prisma/generated/client';
import type { Purchase } from '../../domain/purchase.entity';
import type {
  PurchaseListQuery,
  PurchasePage,
  PurchaseRepository,
} from '../../domain/repositories/purchase.repository';
import { PurchaseMapper } from './mappers/purchase.mapper';
import { PurchaseItemMapper } from './mappers/purchase-item.mapper';

@Injectable()
export class PrismaPurchaseRepository implements PurchaseRepository {
  constructor(@Inject(PRISMA_CLIENT) private readonly prisma: Prisma.TransactionClient) {}

  async findById(id: string): Promise<Purchase | null> {
    const row = await this.prisma.purchase.findUnique({ where: { id }, include: { items: true } });
    return row ? PurchaseMapper.toDomain(row) : null;
  }

  async findByAccessKey(accessKey: string): Promise<Purchase | null> {
    const row = await this.prisma.purchase.findUnique({
      where: { accessKey },
      include: { items: true },
    });
    return row ? PurchaseMapper.toDomain(row) : null;
  }

  async findAll(): Promise<Purchase[]> {
    const rows = await this.prisma.purchase.findMany({
      orderBy: { purchaseDate: 'desc' },
      include: { items: true },
    });
    return rows.map((row) => PurchaseMapper.toDomain(row));
  }

  /**
   * One page of the history, newest first, with the size of the whole
   * filtered set beside it.
   *
   * The count is a second query rather than a fold over the page, because the
   * page is by definition not the whole set. Ordering breaks ties on `id` so
   * that two purchases recorded at the same instant cannot swap places
   * between page one and page two and leave a row unreachable.
   */
  async findPage(query: PurchaseListQuery): Promise<PurchasePage> {
    const where = toWhere(query);

    const [rows, total] = await Promise.all([
      this.prisma.purchase.findMany({
        where,
        orderBy: [{ purchaseDate: 'desc' }, { id: 'desc' }],
        skip: query.offset,
        take: query.limit,
        include: { items: true },
      }),
      this.prisma.purchase.count({ where }),
    ]);

    return {
      purchases: rows.map((row) => PurchaseMapper.toDomain(row)),
      total,
      limit: query.limit,
      offset: query.offset,
    };
  }

  /**
   * Writes the root and its lines together, and drops any line that is no
   * longer part of the aggregate. Saving the whole thing is what makes it
   * impossible to persist a reclassified line without the reattributed
   * discount that came with it.
   *
   * The update half names fewer columns than the insert half: `rawInvoiceData`
   * is written once, when the purchase is created, and is not part of any
   * UPDATE this repository issues.
   */
  async save(purchase: Purchase): Promise<void> {
    await this.prisma.purchase.upsert({
      where: { id: purchase.id },
      create: PurchaseMapper.toPersistence(purchase),
      update: PurchaseMapper.toPersistenceUpdate(purchase),
    });

    const keptIds = purchase.items.map((item) => item.id);

    await this.prisma.purchaseItem.deleteMany({
      where: { purchaseId: purchase.id, id: { notIn: keptIds } },
    });

    for (const item of purchase.items) {
      const itemData = PurchaseItemMapper.toPersistence(item);

      await this.prisma.purchaseItem.upsert({
        where: { id: item.id },
        create: itemData,
        update: itemData,
      });
    }
  }

  async delete(id: string): Promise<void> {
    await this.prisma.purchaseItem.deleteMany({ where: { purchaseId: id } });
    await this.prisma.purchase.delete({ where: { id } });
  }
}

/**
 * The filter shared by the page and its count.
 *
 * The establishment is matched the way its identity is defined: against the
 * CNPJ when the purchase has one, and against the name only for the
 * purchases that have no CNPJ to be identified by — which is what a manual
 * entry is.
 */
export function toWhere(query: {
  from?: Date;
  to?: Date;
  establishmentId?: string;
}): Prisma.PurchaseWhereInput {
  const where: Prisma.PurchaseWhereInput = {};

  if (query.from !== undefined || query.to !== undefined) {
    where.purchaseDate = {
      ...(query.from !== undefined ? { gte: query.from } : {}),
      ...(query.to !== undefined ? { lt: query.to } : {}),
    };
  }

  if (query.establishmentId !== undefined) {
    where.OR = [
      { merchantCnpj: query.establishmentId },
      { merchantCnpj: null, merchantName: query.establishmentId },
    ];
  }

  return where;
}
