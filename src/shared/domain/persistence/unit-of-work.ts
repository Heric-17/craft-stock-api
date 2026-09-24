import type { MaterialRepository } from '../../../modules/materials/domain/repositories/material.repository';
import type { CompositeProductRepository } from '../../../modules/composite-products/domain/repositories/composite-product.repository';
import type { SaleRepository } from '../../../modules/sales/domain/repositories/sale.repository';
import type { PurchaseRepository } from '../../../modules/purchases/domain/repositories/purchase.repository';
import type { PendingInvoiceRepository } from '../../../modules/invoices/domain/repositories/pending-invoice.repository';
import type { UserRepository } from '../../../modules/users/domain/repositories/user.repository';
import type { RefreshTokenRepository } from '../../../modules/auth/domain/repositories/refresh-token.repository';

export interface RepositoryContext {
  materials: MaterialRepository;
  compositeProducts: CompositeProductRepository;
  sales: SaleRepository;
  purchases: PurchaseRepository;
  pendingInvoices: PendingInvoiceRepository;
  users: UserRepository;
  refreshTokens: RefreshTokenRepository;
}

export const UNIT_OF_WORK = Symbol('UNIT_OF_WORK');

export interface UnitOfWork {
  runInTransaction<T>(work: (ctx: RepositoryContext) => Promise<T>): Promise<T>;
}
