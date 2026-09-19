import type { SaleModel } from '../../../../../shared/infrastructure/prisma/generated/models';
import type { Prisma } from '../../../../../shared/infrastructure/prisma/generated/client';
import { Sale } from '../../../domain/sale.entity';

export class SaleMapper {
  static toDomain(row: SaleModel): Sale {
    return new Sale({
      id: row.id,
      customerName: row.customerName,
      customerContact: row.customerContact,
      paymentMethod: row.paymentMethod,
      paymentStatus: row.paymentStatus,
      productionStatus: row.productionStatus,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }

  static toPersistence(sale: Sale): Prisma.SaleUncheckedCreateInput {
    return {
      id: sale.id,
      customerName: sale.customerName,
      customerContact: sale.customerContact,
      paymentMethod: sale.paymentMethod,
      paymentStatus: sale.paymentStatus,
      productionStatus: sale.productionStatus,
      createdAt: sale.createdAt,
      updatedAt: sale.updatedAt,
    };
  }
}
