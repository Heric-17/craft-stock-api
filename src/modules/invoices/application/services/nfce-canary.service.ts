import { Inject, Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

import { EnvService } from '../../../../config/env.service';
import {
  NOTIFICATION_SENDER_FACTORY,
  type NotificationSenderFactory,
} from '../../../../shared/domain/notifications/notification-sender';
import { StructuredLogger } from '../../../../shared/infrastructure/logging/structured-logger.service';
import {
  compareToReferenceInvoice,
  parseReferenceInvoiceUrls,
  resolveCanaryTargets,
  REFERENCE_INVOICES,
  type CanaryTarget,
  type ReferenceInvoiceExpectation,
  type ReferenceInvoiceMismatch,
} from '../../domain/canary/reference-invoice';
import { InvoiceStructureChangedError } from '../../domain/invoice.error';
import {
  INVOICE_PROVIDER_FACTORY,
  type InvoiceProviderFactory,
} from '../../domain/providers/invoice-provider';

/**
 * - `MATCHED`: the note still reads exactly as pinned.
 * - `DIVERGED`: it was read, and one of the pinned fields came back different.
 * - `STRUCTURE_CHANGED`: the parser refused the page outright.
 * - `UNREACHABLE`: nothing was read at all, so nothing can be said about the
 *   markup. On its own this is as likely to be an expired note as a broken
 *   portal, which is exactly why one failure is not enough to alert.
 */
export type CanaryCheckStatus = 'MATCHED' | 'DIVERGED' | 'STRUCTURE_CHANGED' | 'UNREACHABLE';

export interface CanaryCheck {
  label: string;
  url: string;
  status: CanaryCheckStatus;
  mismatches: ReferenceInvoiceMismatch[];
  /** The failure's own message, for the two statuses that have one. */
  detail: string | null;
}

export interface CanaryRun {
  checks: CanaryCheck[];
  /**
   * Whether the run decided the extraction is broken and raised an alert. It
   * says the alert was raised, not that it arrived: a channel that is itself
   * down is logged and does not change this.
   */
  alerted: boolean;
}

/**
 * Watches the NFC-e extraction against notes whose contents are already known.
 *
 * The scraping of the state portal is the most fragile thing in the system,
 * because it depends on markup nobody here controls and which changes without
 * notice. Nothing else would notice it breaking: an import that suddenly finds
 * no total fails for the user who scanned the receipt, at the till, and that is
 * the first anyone hears of it. So a handful of notes already imported are read
 * again every day and compared against values pinned in code.
 *
 * The reference notes are never read from `test/fixtures/`, and nothing here
 * writes to them. A fixture refreshed from the live portal would make the
 * scraper's own tests validate the new markup and stay green, destroying the
 * very alarm this job exists to raise. A fixture changes when a person decides
 * it changes, after looking at what the portal did.
 */
@Injectable()
export class NfceCanaryService {
  constructor(
    @Inject(INVOICE_PROVIDER_FACTORY) private readonly providers: InvoiceProviderFactory,
    @Inject(NOTIFICATION_SENDER_FACTORY) private readonly senders: NotificationSenderFactory,
    @Inject(REFERENCE_INVOICES)
    private readonly references: readonly ReferenceInvoiceExpectation[],
    private readonly env: EnvService,
    private readonly logger: StructuredLogger,
  ) {}

  /** Resolves however the run went. The only thing it can throw is a programming error. */
  async run(): Promise<CanaryRun> {
    const urls = parseReferenceInvoiceUrls(this.env.get('NFCE_CANARY_URLS'));
    const { targets, unpairedUrls } = resolveCanaryTargets(urls, this.references);

    for (const url of unpairedUrls) {
      // Configuration, not the portal: a URL nobody pinned expectations for
      // has nothing to be compared against. Said out loud, because a canary
      // that quietly checks nothing is worse than no canary at all.
      this.logger.warn(
        `The canary URL ${url} carries no access key matching a pinned reference note, so it was not checked.`,
        NfceCanaryService.name,
      );
    }

    if (targets.length === 0) {
      this.logger.log(
        'The NFC-e canary has no reference note to check. Pin the notes in code and list their URLs in NFCE_CANARY_URLS.',
        NfceCanaryService.name,
      );

      return { checks: [], alerted: false };
    }

    if (targets.length === 1) {
      this.logger.warn(
        'Only one reference note is configured, so an expired note cannot be told apart from a broken portal: its failure will alert either way. Configure two or three notes issued on different dates.',
        NfceCanaryService.name,
      );
    }

    const checks: CanaryCheck[] = [];

    // One at a time, on purpose. Three simultaneous requests to a portal that
    // already drops requests under load would make the canary the reason it
    // failed.
    for (const target of targets) {
      checks.push(await this.check(target));
    }

    return this.report(checks);
  }

  @Cron(CronExpression.EVERY_DAY_AT_4AM)
  async handleCron(): Promise<void> {
    try {
      await this.run();
    } catch (error) {
      // A scheduled job has nobody to hand an exception to, and one that
      // escapes here leaves through the process's unhandled rejection path.
      this.logger.error(
        'The NFC-e canary run failed.',
        error instanceof Error ? error.stack : undefined,
        NfceCanaryService.name,
      );
    }
  }

  private async check(target: CanaryTarget): Promise<CanaryCheck> {
    const base = { label: target.expectation.label, url: target.url };

    try {
      const provider = this.providers.create(target.url);
      const invoice = await provider.fetchInvoice(target.url);
      const mismatches = compareToReferenceInvoice(target.expectation, invoice);

      return {
        ...base,
        status: mismatches.length === 0 ? 'MATCHED' : 'DIVERGED',
        mismatches,
        detail: null,
      };
    } catch (error) {
      if (error instanceof InvoiceStructureChangedError) {
        return { ...base, status: 'STRUCTURE_CHANGED', mismatches: [], detail: error.message };
      }

      // Anything else — the portal not answering, the transport failing, a
      // state no provider covers — means no page was read, so the markup is
      // not what this is evidence about.
      return { ...base, status: 'UNREACHABLE', mismatches: [], detail: messageOf(error) };
    }
  }

  /**
   * Decides whether what came back is worth an alert.
   *
   * Only a run in which EVERY reference note failed raises one. The public
   * consultation of an NFC-e expires, so one note going quiet while the others
   * still read correctly is that note's age, not the portal's markup — and
   * alerting on it would teach whoever receives these alerts to ignore them,
   * which costs more than the day it would have gained.
   */
  private async report(checks: CanaryCheck[]): Promise<CanaryRun> {
    const failures = checks.filter((check) => check.status !== 'MATCHED');

    if (failures.length === 0) {
      this.logger.log(
        `The NFC-e canary checked ${checks.length} reference note(s); all of them read as expected.`,
        NfceCanaryService.name,
      );

      return { checks, alerted: false };
    }

    for (const failure of failures) {
      this.logger.warn(describeCheck(failure), NfceCanaryService.name);
    }

    if (failures.length < checks.length) {
      this.logger.warn(
        `${failures.length} of ${checks.length} reference notes failed while the rest read as expected. Taken as those notes' public consultation having expired rather than a broken portal, so no alert was raised.`,
        NfceCanaryService.name,
      );

      return { checks, alerted: false };
    }

    await this.alert(checks);

    return { checks, alerted: true };
  }

  private async alert(checks: readonly CanaryCheck[]): Promise<void> {
    try {
      await this.senders.create().send(subjectOf(checks), bodyOf(checks));
    } catch (error) {
      // The alert is a side effect of the check, not the check itself. A mail
      // server that is also down must not cost the run its log lines, nor look
      // like a second failure of the portal.
      this.logger.error(
        'The NFC-e canary could not send its alert. The failure it describes is in the lines above.',
        error instanceof Error ? error.stack : undefined,
        NfceCanaryService.name,
      );
    }
  }
}

/**
 * Two subjects, because they ask for different things: a note that was read
 * and disagrees means the extraction is producing wrong values right now,
 * while nothing having been read at all is either the portal being down or
 * every reference note having expired, and then it is the reference notes that
 * need looking at.
 */
function subjectOf(checks: readonly CanaryCheck[]): string {
  const anyPageWasRead = checks.some((check) => check.status !== 'UNREACHABLE');

  return anyPageWasRead
    ? '[CraftStock] The NFC-e extraction no longer matches the reference notes'
    : '[CraftStock] No NFC-e reference note could be read';
}

function bodyOf(checks: readonly CanaryCheck[]): string {
  return [
    `All ${checks.length} reference note(s) failed on this run, so the NFC-e import is likely broken for every note.`,
    '',
    ...checks.map(describeCheck),
    '',
    'The test fixtures were not touched. Compare the portal page against them by hand before changing anything: a fixture refreshed from the portal would make the scraper tests pass against the new markup and hide this.',
  ].join('\n');
}

function describeCheck(check: CanaryCheck): string {
  const header = `${check.label} (${check.url}): ${check.status}`;

  if (check.status === 'DIVERGED') {
    const fields = check.mismatches
      .map(
        (mismatch) => `${mismatch.field} expected "${mismatch.expected}", got "${mismatch.actual}"`,
      )
      .join('; ');

    return `${header} — ${fields}`;
  }

  return check.detail === null ? header : `${header} — ${check.detail}`;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
