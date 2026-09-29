import { Module } from '@nestjs/common';

import { EnvModule } from '../../../config/env.module';
import { ErrorAlertService } from '../../application/observability/error-alert.service';
import { NOTIFICATION_SENDER_FACTORY } from '../../domain/notifications/notification-sender';
import { LoggingModule } from '../logging/logging.module';
import { ConsoleNotificationSender } from './console-notification.sender';
import { EnvNotificationSenderFactory } from './notification-sender.factory';
import { SmtpNotificationSender } from './smtp-notification.sender';

/**
 * Composition root for operational alerting: the two channels, the factory
 * that selects between them, and the one service that decides when an alert
 * is worth sending.
 *
 * `ErrorAlertService` itself lives in `application/` and knows nothing about
 * either channel — it is wired here because this is where the implementations
 * it selects among are registered.
 */
@Module({
  imports: [EnvModule, LoggingModule],
  providers: [
    // Registered so the container builds each one with its own dependencies.
    // The factory receives them and only ever selects.
    ConsoleNotificationSender,
    SmtpNotificationSender,
    { provide: NOTIFICATION_SENDER_FACTORY, useClass: EnvNotificationSenderFactory },
    ErrorAlertService,
  ],
  exports: [NOTIFICATION_SENDER_FACTORY, ErrorAlertService],
})
export class NotificationsModule {}
