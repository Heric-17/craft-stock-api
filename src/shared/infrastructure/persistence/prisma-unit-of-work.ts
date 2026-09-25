import { Inject, Injectable } from '@nestjs/common';

import { PrismaRefreshTokenRepository } from '../../../modules/auth/infrastructure/persistence/prisma-refresh-token.repository';
import { PrismaCompositeProductRepository } from '../../../modules/composite-products/infrastructure/persistence/prisma-composite-product.repository';
import { PrismaPendingInvoiceRepository } from '../../../modules/invoices/infrastructure/persistence/prisma-pending-invoice.repository';
import { PrismaMaterialRepository } from '../../../modules/materials/infrastructure/persistence/prisma-material.repository';
import { PrismaPurchaseRepository } from '../../../modules/purchases/infrastructure/persistence/prisma-purchase.repository';
import { PrismaSaleRepository } from '../../../modules/sales/infrastructure/persistence/prisma-sale.repository';
import { PrismaUserRepository } from '../../../modules/users/infrastructure/persistence/prisma-user.repository';
import type { RepositoryContext, UnitOfWork } from '../../domain/persistence/unit-of-work';
import type { Prisma } from '../prisma/generated/client';
import { PRISMA_CLIENT } from '../prisma/prisma-client.token';
import { PrismaTransactionContextService } from '../prisma/prisma-transaction-context.service';

@Injectable()
export class PrismaUnitOfWork implements UnitOfWork {
  constructor(
    @Inject(PRISMA_CLIENT) private readonly prisma: Prisma.TransactionClient,
    private readonly txContext: PrismaTransactionContextService,
  ) {}

  async runInTransaction<T>(work: (ctx: RepositoryContext) => Promise<T>): Promise<T> {
    return this.prisma.$transaction((tx) => this.txContext.run(tx, () => work(this.buildContext(tx))));
  }

  private buildContext(tx: Prisma.TransactionClient): RepositoryContext {
    return {
      materials: new PrismaMaterialRepository(tx),
      compositeProducts: new PrismaCompositeProductRepository(tx),
      sales: new PrismaSaleRepository(tx),
      purchases: new PrismaPurchaseRepository(tx),
      pendingInvoices: new PrismaPendingInvoiceRepository(tx),
      users: new PrismaUserRepository(tx),
      refreshTokens: new PrismaRefreshTokenRepository(tx),
    };
  }
}
