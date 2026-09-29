import { Injectable } from '@nestjs/common';

import type { NotificationSender } from '../../domain/notifications/notification-sender';
import { StructuredLogger } from '../logging/structured-logger.service';

/**
 * The development and test channel: the alert goes to the structured log,
 * where everything else about the request already is. No transport, nothing to
 * configure, and nothing that can be accidentally sent to a real inbox from a
 * developer's machine.
 */
@Injectable()
export class ConsoleNotificationSender implements NotificationSender {
  constructor(private readonly logger: StructuredLogger) {}

  send(subject: string, body: string): Promise<void> {
    this.logger.warn(`[alert] ${subject}\n${body}`, ConsoleNotificationSender.name);

    return Promise.resolve();
  }
}
