import { randomUUID } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';

import { EnvService } from '../../../../config/env.service';
import { Money } from '../../../../shared/domain/money/money';
import { UNIT_OF_WORK, type UnitOfWork } from '../../../../shared/domain/persistence/unit-of-work';
import { StructuredLogger } from '../../../../shared/infrastructure/logging/structured-logger.service';
import { Establishment } from '../../../purchases/domain/establishment';
import { Purchase } from '../../../purchases/domain/purchase.entity';
import { PurchaseItem } from '../../../purchases/domain/purchase-item.entity';
import { aggregateInvoiceItems } from '../../domain/invoice-item-aggregation';
import {
  DuplicateInvoiceError,
  InvoiceSourceUnavailableError,
  InvoiceStructureChangedError,
} from '../../domain/invoice.error';
import { PendingInvoice } from '../../domain/pending-invoice.entity';
import { InvalidPendingInvoiceError } from '../../domain/pending-invoice.error';
import { DELAY, type Delay } from '../../domain/ports/delay.port';
import {
  INVOICE_PROVIDER_FACTORY,
  type InvoiceProviderFactory,
} from '../../domain/providers/invoice-provider';
import type { RawInvoice } from '../../domain/raw-invoice';
import type { ImportedInvoiceView } from '../dto/invoices.dto';
import { InvoiceViewMapper } from '../mappers/invoice-view.mapper';
import { RawInvoiceSnapshotMapper } from '../mappers/raw-invoice-snapshot.mapper';

/** What the transactional part of an import concluded. */
type PersistResult =
  { outcome: 'IMPORTED'; purchase: Purchase } | { outcome: 'DUPLICATE'; purchase: Purchase };

/**
 * The whole NFC-e import, behind one method.
 *
 * Importing a note is seven steps across four collaborators: queue the
 * capture, pick the provider for its state, read the portal with a
 * progressive retry, refuse a note that was already imported, freeze the raw
 * extraction, turn the lines into a `Purchase`, and close the capture. The
 * controller chains none of that — it calls `importFromUrl` and gets a
 * result.
 *
 * The network work sits deliberately outside the transaction. Holding a
 * database transaction open across three attempts at an external portal,
 * with a backoff between them, would keep a write transaction alive for
 * seconds against a service that is already known to be unreliable.
 */
@Injectable()
export class InvoiceImportFacade {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: UnitOfWork,
    @Inject(INVOICE_PROVIDER_FACTORY) private readonly providers: InvoiceProviderFactory,
    @Inject(DELAY) private readonly delay: Delay,
    private readonly env: EnvService,
    private readonly logger: StructuredLogger,
  ) {}

  /**
   * Imports the note behind a captured QR Code URL.
   *
   * The capture is queued before anything is attempted, so a scan made on a
   * phone survives a portal that is down and can be finished later, from
   * another device.
   */
  async importFromUrl(url: string): Promise<ImportedInvoiceView> {
    const capture = await this.unitOfWork.runInTransaction(async (ctx) => {
      const existing = await ctx.pendingInvoices.findByUrl(url);

      if (existing !== null && !existing.isImported) {
        return existing;
      }

      const pending = PendingInvoice.capture(randomUUID(), url, new Date());
      await ctx.pendingInvoices.save(pending);

      return pending;
    });

    return this.process(capture);
  }

  /**
   * Picks a queued capture back up. This is what makes the queue useful
   * rather than merely a log: a note scanned at the till and left `UNSTABLE`
   * because the portal was down is retried from the pending list, without
   * the paper receipt being needed again.
   */
  async reprocess(pendingInvoiceId: string): Promise<ImportedInvoiceView> {
    const pending = await this.unitOfWork.runInTransaction((ctx) =>
      ctx.pendingInvoices.findById(pendingInvoiceId),
    );

    if (pending === null) {
      throw new InvalidPendingInvoiceError(`PendingInvoice ${pendingInvoiceId} does not exist.`);
    }

    if (pending.isImported && pending.purchaseId !== null) {
      throw new DuplicateInvoiceError(pending.url, pending.purchaseId);
    }

    return this.process(pending);
  }

  private async process(pending: PendingInvoice): Promise<ImportedInvoiceView> {
    const invoice = await this.extract(pending);
    const result = await this.persist(pending, invoice);

    if (result.outcome === 'DUPLICATE') {
      // The capture is closed against the purchase that already exists — it
      // really has been imported — and only then is the caller told, so the
      // 409 carries the reference instead of just a refusal.
      throw new DuplicateInvoiceError(invoice.accessKey, result.purchase.id);
    }

    // Nothing is classified on a note that has just been imported, so no
    // line points at a Material and there is no unit to report yet.
    return InvoiceViewMapper.toImportedView(result.purchase, pending.id, new Map());
  }

  /**
   * Reads the note, retrying only what is worth retrying.
   *
   * A transport failure is retried with a progressive wait: the portal is
   * momentarily unreachable and may well answer next time. A page that came
   * back and is not a note is not retried at all — it will not have become
   * one a second later, and hammering the portal over our own broken
   * selectors helps nobody.
   */
  private async extract(pending: PendingInvoice): Promise<RawInvoice> {
    const provider = this.providers.create(pending.url);
    const maxAttempts = this.env.get('NFCE_IMPORT_MAX_ATTEMPTS');
    const baseDelay = this.env.get('NFCE_IMPORT_RETRY_DELAY_MS');

    let lastFailure: InvoiceSourceUnavailableError | null = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        return await provider.fetchInvoice(pending.url);
      } catch (error) {
        if (error instanceof InvoiceStructureChangedError) {
          await this.recordUnreadable(pending, error);
          throw error;
        }

        if (!(error instanceof InvoiceSourceUnavailableError)) {
          throw error;
        }

        lastFailure = error;

        if (attempt < maxAttempts) {
          this.logger.warn(
            `NFC-e source unavailable on attempt ${attempt}/${maxAttempts} for PendingInvoice ${pending.id}: ${error.message}`,
            InvoiceImportFacade.name,
          );

          await this.delay.wait(baseDelay * 2 ** (attempt - 1));
        }
      }
    }

    const failure = new InvoiceSourceUnavailableError(
      `The NFC-e source did not answer after ${maxAttempts} attempts: ${lastFailure?.message ?? 'unknown reason'}`,
      maxAttempts,
    );

    await this.recordUnstable(pending, failure);

    throw failure;
  }

  private async persist(pending: PendingInvoice, invoice: RawInvoice): Promise<PersistResult> {
    return this.unitOfWork.runInTransaction(async (ctx) => {
      const alreadyImported = await ctx.purchases.findByAccessKey(invoice.accessKey);

      if (alreadyImported !== null) {
        await ctx.pendingInvoices.save(pending.markImported(alreadyImported.id, new Date()));

        return { outcome: 'DUPLICATE', purchase: alreadyImported };
      }

      const purchase = this.buildPurchase(invoice);

      await ctx.purchases.save(purchase);
      await ctx.pendingInvoices.save(pending.markImported(purchase.id, new Date()));

      return { outcome: 'IMPORTED', purchase };
    });
  }

  /**
   * Turns an extracted note into a `Purchase`.
   *
   * The lines are folded together by product code first. An item weighed at
   * the till is rung up once per weighing, so without this the user would be
   * asked to classify the same cheese four times and would end up with four
   * separate stock entries for it. The printed lines are not lost: they are
   * exactly what `rawInvoiceData` keeps.
   *
   * Nothing is classified yet. Every line starts as an unclassified company
   * expense with no `Material` behind it, and the discount starts spread
   * proportionally — which is a placeholder the user replaces on the
   * classification screen, and which is never even shown when the note
   * carries no discount.
   */
  private buildPurchase(invoice: RawInvoice): Purchase {
    const purchaseId = randomUUID();
    const aggregated = aggregateInvoiceItems(invoice.items);

    const items = aggregated.map(
      (line) =>
        new PurchaseItem({
          id: randomUUID(),
          purchaseId,
          code: line.code,
          description: line.description,
          quantity: line.quantity,
          unit: line.unit,
          unitPrice: line.unitPrice,
          grossValue: line.grossValue,
          allocatedDiscount: Money.zero(),
          isCompanyExpense: true,
          isStockMaterial: false,
          materialId: null,
        }),
    );

    const purchase = new Purchase({
      id: purchaseId,
      purchaseDate: invoice.issuedAt,
      accessKey: invoice.accessKey,
      rawInvoiceData: RawInvoiceSnapshotMapper.toSnapshot(invoice),
      // Also kept in columns of its own, beside the snapshot: the spending
      // panel groups and filters by the shop, and a dimension it reads must
      // not depend on digging through a frozen JSON document.
      establishment: new Establishment({ name: invoice.merchantName, cnpj: invoice.cnpj }),
      grossTotal: invoice.grossTotal,
      discountTotal: invoice.discountTotal,
      netTotal: invoice.netTotal,
      discountAllocationMode: 'PROPORTIONAL',
      // Built with the discount not yet attributed, which is what this flag
      // says, and attributed by the root on the next line. Every decision
      // about where a note's discount lands is made in one place.
      allocationPending: !invoice.discountTotal.isZero(),
      items,
      createdAt: new Date(),
    });

    return purchase.changeDiscountAllocation('PROPORTIONAL');
  }

  /**
   * The portal is down. The capture is parked as `UNSTABLE` with its attempt
   * counted, which is what the pending list offers to retry.
   */
  private async recordUnstable(
    pending: PendingInvoice,
    failure: InvoiceSourceUnavailableError,
  ): Promise<void> {
    await this.unitOfWork.runInTransaction((ctx) =>
      ctx.pendingInvoices.save(pending.markUnstable(new Date(), failure.message)),
    );
  }

  /**
   * The portal answered with something that is not a note we can read.
   *
   * Logged at error severity on purpose: this is the alarm for the scraping
   * having broken against a change in the portal's markup, and it needs to be
   * loud. Every import from that state is failing until someone looks.
   */
  private async recordUnreadable(
    pending: PendingInvoice,
    failure: InvoiceStructureChangedError,
  ): Promise<void> {
    this.logger.error(
      `NFC-e extraction failed structurally for PendingInvoice ${pending.id} (${pending.url}): ${failure.message} The portal markup has probably changed and every import from this source is now failing.`,
      failure.stack,
      InvoiceImportFacade.name,
    );

    await this.unitOfWork.runInTransaction((ctx) =>
      ctx.pendingInvoices.save(pending.markUnreadable(new Date(), failure.message)),
    );
  }
}
