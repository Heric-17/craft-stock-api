import {
  toDomainMoney,
  toPersistenceDecimal,
} from '../../../../../shared/infrastructure/persistence/money.mapper';
import type {
  PurchaseItemModel,
  PurchaseModel,
} from '../../../../../shared/infrastructure/prisma/generated/models';
import { Prisma } from '../../../../../shared/infrastructure/prisma/generated/client';
import { Establishment } from '../../../domain/establishment';
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
      establishment:
        row.merchantName === null
          ? null
          : new Establishment({ name: row.merchantName, cnpj: row.merchantCnpj }),
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
      accessKey: purchase.accessKey,
      rawInvoiceData:
        purchase.rawInvoiceData === null
          ? Prisma.JsonNull
          : (purchase.rawInvoiceData as Prisma.InputJsonValue),
      createdAt: purchase.createdAt,
      purchaseDate: purchase.purchaseDate,
      merchantName: purchase.establishment?.name ?? null,
      merchantCnpj: purchase.establishment?.cnpj ?? null,
      grossTotal: toPersistenceDecimal(purchase.grossTotal),
      discountTotal: toPersistenceDecimal(purchase.discountTotal),
      netTotal: toPersistenceDecimal(purchase.netTotal),
      discountAllocationMode: purchase.discountAllocationMode,
      allocationPending: purchase.allocationPending,
    };
  }

  /**
   * What an existing purchase is allowed to have rewritten.
   *
   * `rawInvoiceData` is absent, and that is the whole point of the method
   * existing: the captured note is what the user reconciles against the card
   * statement, so it is written once, at insert, and never appears in an
   * UPDATE at all. Editing the lines cannot touch it — not because no code
   * path happens to, but because the column is not in the statement.
   * `accessKey` and `createdAt` are left out for the same reason: they are
   * facts of the capture, not state of the purchase.
   */
  static toPersistenceUpdate(purchase: Purchase): Prisma.PurchaseUncheckedUpdateInput {
    return {
      purchaseDate: purchase.purchaseDate,
      merchantName: purchase.establishment?.name ?? null,
      merchantCnpj: purchase.establishment?.cnpj ?? null,
      grossTotal: toPersistenceDecimal(purchase.grossTotal),
      discountTotal: toPersistenceDecimal(purchase.discountTotal),
      netTotal: toPersistenceDecimal(purchase.netTotal),
      discountAllocationMode: purchase.discountAllocationMode,
      allocationPending: purchase.allocationPending,
    };
  }
}
