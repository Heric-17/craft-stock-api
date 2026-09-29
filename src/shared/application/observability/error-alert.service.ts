import { Inject, Injectable } from '@nestjs/common';

import { EnvService } from '../../../config/env.service';
import {
  NOTIFICATION_SENDER_FACTORY,
  type NotificationSenderFactory,
} from '../../domain/notifications/notification-sender';
import { StructuredLogger } from '../../infrastructure/logging/structured-logger.service';

export interface ServerErrorAlert {
  /** The exception class, already decided by `describeFailure`. Also the throttling key. */
  errorType: string;
  /** The redacted message from the request record — never the raw exception text. */
  message: string;
  route: string;
  httpMethod: string;
  statusCode: number;
  /** What the caller was handed as `errorId`, and what the investigation endpoint resolves. */
  correlationId?: string;
}

/**
 * Turns an unhandled failure into an operational alert, and does two things
 * that the failure path itself must not have to think about.
 *
 * It throttles per `errorType`: an error inside a loop, or a portal that is
 * down for an hour, is one alert and a count of what followed it — not three
 * hundred messages that get filtered into a folder nobody opens.
 *
 * And it never propagates a failure of its own. An alert is a side effect of
 * the thing that went wrong; a mail server that is also down must not turn a
 * logged 500 into a second, louder one. It knows only
 * `NotificationSender`, so which channel carries it — log, e-mail, or
 * something added later — is not its concern.
 */
@Injectable()
export class ErrorAlertService {
  private readonly lastAlertAt = new Map<string, number>();
  private readonly suppressedSince = new Map<string, number>();

  constructor(
    @Inject(NOTIFICATION_SENDER_FACTORY)
    private readonly senders: NotificationSenderFactory,
    private readonly env: EnvService,
    private readonly logger: StructuredLogger,
  ) {}

  /** Resolves either way: sent, throttled, or failed to send. Never rejects. */
  async notifyServerError(alert: ServerErrorAlert): Promise<void> {
    const now = Date.now();

    if (this.isThrottled(alert.errorType, now)) {
      this.suppressedSince.set(
        alert.errorType,
        (this.suppressedSince.get(alert.errorType) ?? 0) + 1,
      );

      return;
    }

    const suppressed = this.suppressedSince.get(alert.errorType) ?? 0;

    this.lastAlertAt.set(alert.errorType, now);
    this.suppressedSince.delete(alert.errorType);

    try {
      await this.senders.create().send(subjectOf(alert), bodyOf(alert, suppressed));
    } catch (error) {
      // The alert is the side effect, not the task. Visibility here, and the
      // request that triggered it is unaffected either way.
      this.logger.error(
        `Failed to send the alert for ${alert.errorType}`,
        error instanceof Error ? error.stack : undefined,
        ErrorAlertService.name,
      );
    }
  }

  private isThrottled(errorType: string, now: number): boolean {
    const windowMs = this.env.get('ERROR_ALERT_THROTTLE_SECONDS') * 1_000;

    if (windowMs === 0) {
      return false;
    }

    const last = this.lastAlertAt.get(errorType);

    return last !== undefined && now - last < windowMs;
  }
}

function subjectOf(alert: ServerErrorAlert): string {
  return `[CraftStock] ${alert.statusCode} ${alert.errorType} on ${alert.httpMethod} ${alert.route}`;
}

function bodyOf(alert: ServerErrorAlert, suppressed: number): string {
  const lines = [
    `${alert.httpMethod} ${alert.route} failed with ${alert.statusCode}.`,
    `Error type: ${alert.errorType}`,
    `Message: ${alert.message}`,
  ];

  if (alert.correlationId !== undefined) {
    // The one line that makes the alert actionable: it is the errorId the
    // caller was given, and the investigation endpoint takes it as it is.
    lines.push(`errorId: ${alert.correlationId}`);
  }

  if (suppressed > 0) {
    lines.push(`${suppressed} further occurrence(s) of this error type were not alerted on.`);
  }

  return lines.join('\n');
}
