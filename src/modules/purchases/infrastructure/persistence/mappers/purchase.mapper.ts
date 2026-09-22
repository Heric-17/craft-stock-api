import {
  toDomainMoney,
  toPersistenceDecimal,
} from '../../../../../shared/infrastructure/persistence/money.mapper';
import type {
  PurchaseItemModel,
  PurchaseModel,
} from '../../../../../shared/infrastructure/prisma/generated/models';
import { Prisma } from '../../../../../shared/infrastructure/prisma/generated/client';
import { Purchase } from '../../../domain/purchase.entity';
import { PurchaseItemMapper } from './purchase-item.mapper';

/** A purchase row together with its lines — the aggregate is never loaded partial. */
export type PurchaseRow = PurchaseModel & { items: PurchaseItemModel[] };

export class PurchaseMapper {
  static toDomain(row: PurchaseRow): Purchase {
    return new Purchase({
      id: row.id,
      purchaseDate: row.purchaseDate,
      accessKey: row.accessKey,
      rawInvoiceData: row.rawInvoiceData as Record<string, unknown> | null,
      grossTotal: toDomainMoney(row.grossTotal),
      discountTotal: toDomainMoney(row.discountTotal),
      netTotal: toDomainMoney(row.netTotal),
      // The generated enum stops here. It happens to be the same union of
      // string literals as the domain type, so no conversion is needed — but
      // this is the boundary at which the generated name is left behind, and
      // nothing past this mapper refers to it.
      discountAllocationMode: row.discountAllocationMode,
      allocationPending: row.allocationPending,
      items: row.items.map((item) => PurchaseItemMapper.toDomain(item)),
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
      grossTotal: toPersistenceDecimal(purchase.grossTotal),
      discountTotal: toPersistenceDecimal(purchase.discountTotal),
      netTotal: toPersistenceDecimal(purchase.netTotal),
      discountAllocationMode: purchase.discountAllocationMode,
      allocationPending: purchase.allocationPending,
      createdAt: purchase.createdAt,
    };
  }
}
