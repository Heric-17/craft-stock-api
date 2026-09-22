import type { Money } from '../../../shared/domain/money/money';

/**
 * One line exactly as the note printed it. "Exactly" matters: a weighed item
 * is rung up once per weighing, so the same `code` legitimately appears on
 * several lines of the same note. Nothing is merged here — merging happens in
 * `aggregateInvoiceItems`, on the way to the user, while this list is what
 * gets frozen into `rawInvoiceData`.
 */
export interface RawInvoiceItem {
  /** The merchant's own product code. The key the aggregation groups by. */
  code: string;
  description: string;
  quantity: number;
  /**
   * The unit as the page printed it, suffix and all (`UND9`, `KG9`, `PCT9`).
   * Informative only, for display next to the line while the user classifies
   * it. It never feeds `packageQuantity`: a package of cheese is rung up as
   * one package, while what stock cares about is the 200 g inside it, and
   * only the user knows that.
   */
  unit: string;
  unitPrice: Money;
  /** The line total the note itself reports — the authority over our own multiplication. */
  grossValue: Money;
}

export interface RawInvoicePayment {
  method: string;
  amount: Money;
}

/**
 * An NFC-e as extracted from the state portal's public consultation page.
 * A domain type: `Money` for every amount, a real `Date` for the issue
 * instant, and no trace of whichever HTML or HTTP client produced it.
 *
 * There is deliberately no consumer CPF field. The page shows the CPF given
 * at the till; it is not read, not stored, and not present in
 * `rawInvoiceData` either.
 */
export interface RawInvoice {
  merchantName: string;
  cnpj: string;
  address: string;
  invoiceNumber: string;
  series: string;
  issuedAt: Date;
  /** 44 digits, validated on extraction. Deduplicates imports. */
  accessKey: string;
  /** Sum of the lines at full price. What `packageCost` is ever fed from. */
  grossTotal: Money;
  /** Discount the note granted over the whole purchase, never per line. */
  discountTotal: Money;
  /** What was actually paid. */
  netTotal: Money;
  taxTotal: Money;
  /**
   * The note's own "Qtd. total de itens". Checked against how many lines were
   * actually extracted — the cheapest possible detection of the scraping
   * having broken, and it fires before a wrong value can reach stock.
   */
  reportedItemCount: number;
  payments: RawInvoicePayment[];
  items: RawInvoiceItem[];
}
