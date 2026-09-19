import type { PurchaseModel } from '../../../../../shared/infrastructure/prisma/generated/models';
import { Prisma } from '../../../../../shared/infrastructure/prisma/generated/client';
import { Purchase } from '../../../domain/purchase.entity';

export class PurchaseMapper {
  static toDomain(row: PurchaseModel): Purchase {
    return new Purchase({
      id: row.id,
      purchaseDate: row.purchaseDate,
      accessKey: row.accessKey,
      rawInvoiceData: row.rawInvoiceData as Record<string, unknown> | null,
      createdAt: row.createdAt,
    });
  }

  static toPersistence(purchase: Purchase): Prisma.PurchaseUncheckedCreateInput {
    return {
      id: purchase.id,
      purchaseDate: purchase.purchaseDate,
      accessKey: purchase.accessKey,
      rawInvoiceData:
        purchase.rawInvoiceData === null
          ? Prisma.JsonNull
          : (purchase.rawInvoiceData as Prisma.InputJsonValue),
      createdAt: purchase.createdAt,
    };
  }
}
