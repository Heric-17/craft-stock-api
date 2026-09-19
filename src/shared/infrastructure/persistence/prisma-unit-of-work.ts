import { Injectable } from '@nestjs/common';

import { PrismaCompositeProductRepository } from '../../../modules/composite-products/infrastructure/persistence/prisma-composite-product.repository';
import { PrismaPendingInvoiceRepository } from '../../../modules/invoices/infrastructure/persistence/prisma-pending-invoice.repository';
import { PrismaMaterialRepository } from '../../../modules/materials/infrastructure/persistence/prisma-material.repository';
import { PrismaPurchaseRepository } from '../../../modules/purchases/infrastructure/persistence/prisma-purchase.repository';
import { PrismaSaleRepository } from '../../../modules/sales/infrastructure/persistence/prisma-sale.repository';
import { PrismaUserRepository } from '../../../modules/users/infrastructure/persistence/prisma-user.repository';
import type { RepositoryContext, UnitOfWork } from '../../domain/persistence/unit-of-work';
import type { Prisma } from '../prisma/generated/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PrismaUnitOfWork implements UnitOfWork {
  constructor(private readonly prisma: PrismaService) {}

  async runInTransaction<T>(work: (ctx: RepositoryContext) => Promise<T>): Promise<T> {
    return this.prisma.$transaction((tx) => work(this.buildContext(tx)));
  }

  /**
   * Wires repositories to the transactional client handed out by
   * `$transaction`. This construction is `UnitOfWork`'s own job (CLAUDE.md
   * 6.5), distinct from the Factory pattern in 6.3: a DI container has no way
   * to hand out an instance pre-bound to one specific, short-lived
   * transaction client, so building it here — once per transaction — is the
   * correct place, not a container bypass.
   */
  private buildContext(tx: Prisma.TransactionClient): RepositoryContext {
    return {
      materials: new PrismaMaterialRepository(tx),
      compositeProducts: new PrismaCompositeProductRepository(tx),
      sales: new PrismaSaleRepository(tx),
      purchases: new PrismaPurchaseRepository(tx),
      pendingInvoices: new PrismaPendingInvoiceRepository(tx),
      users: new PrismaUserRepository(tx),
    };
  }
}
