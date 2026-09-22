import type { RawInvoice } from '../../domain/raw-invoice';

/**
 * Freezes an extracted note into the plain JSON that goes in
 * `rawInvoiceData`.
 *
 * Two things about it are deliberate.
 *
 * The item list here is the note's *printed* lines, not the aggregated ones.
 * A weighed item is rung up once per weighing, and the aggregation that folds
 * those lines together exists for the user and for the `PurchaseItem`s. This
 * snapshot is a captured fact and keeps what the note actually said, so the
 * aggregation can always be re-derived from it while the reverse is
 * impossible.
 *
 * And there is no consumer CPF in it. The page shows one; it is not read
 * anywhere upstream of here, so there is nothing to leave out. The omission
 * is the point, not an oversight.
 */
export class RawInvoiceSnapshotMapper {
  static toSnapshot(invoice: RawInvoice): Record<string, unknown> {
    return {
      merchantName: invoice.merchantName,
      cnpj: invoice.cnpj,
      address: invoice.address,
      invoiceNumber: invoice.invoiceNumber,
      series: invoice.series,
      issuedAt: invoice.issuedAt.toISOString(),
      accessKey: invoice.accessKey,
      grossTotal: invoice.grossTotal.toDecimalString(),
      discountTotal: invoice.discountTotal.toDecimalString(),
      netTotal: invoice.netTotal.toDecimalString(),
      taxTotal: invoice.taxTotal.toDecimalString(),
      reportedItemCount: invoice.reportedItemCount,
      payments: invoice.payments.map((payment) => ({
        method: payment.method,
        amount: payment.amount.toDecimalString(),
      })),
      items: invoice.items.map((item) => ({
        code: item.code,
        description: item.description,
        quantity: item.quantity,
        unit: item.unit,
        unitPrice: item.unitPrice.toDecimalString(),
        grossValue: item.grossValue.toDecimalString(),
      })),
    };
  }
}
