import { Injectable } from '@nestjs/common';

import { EnvService } from '../../../config/env.service';
import type {
  NotificationSender,
  NotificationSenderFactory,
} from '../../domain/notifications/notification-sender';
import { ConsoleNotificationSender } from './console-notification.sender';
import { SmtpNotificationSender } from './smtp-notification.sender';

/**
 * Chooses the alert channel for the whole installation from
 * `NOTIFICATION_SENDER`.
 *
 * Both senders arrive through the constructor, already built by the container,
 * and this class only ever picks one — never `new`, which would construct a
 * sender outside the container and leave it without the logger and the
 * configuration the container injects.
 */
@Injectable()
export class EnvNotificationSenderFactory implements NotificationSenderFactory {
  constructor(
    private readonly console: ConsoleNotificationSender,
    private readonly smtp: SmtpNotificationSender,
    private readonly env: EnvService,
  ) {}

  create(): NotificationSender {
    switch (this.env.get('NOTIFICATION_SENDER')) {
      case 'SMTP':
        return this.smtp;
      case 'CONSOLE':
        return this.console;
    }
  }
}
