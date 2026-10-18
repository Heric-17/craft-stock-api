import { Injectable } from '@nestjs/common';

import { EnvService } from '../../../config/env.service';
import type { EmailMessage, EmailSender } from '../../domain/email/email-sender';
import { StructuredLogger } from '../logging/structured-logger.service';

/**
 * The channel for a machine with no mail server: nothing is sent, the message
 * is written to the log so it can be read there.
 *
 * Outside production the whole message is logged, link included — that is the
 * point of the channel in development. In production only the recipient and
 * the subject are: these messages carry a one-time link that is as good as a
 * password, and an installation left on this channel by mistake must not turn
 * its log into a place where anyone who can read it can take an account.
 */
@Injectable()
export class ConsoleEmailSender implements EmailSender {
  constructor(
    private readonly logger: StructuredLogger,
    private readonly env: EnvService,
  ) {}

  send(message: EmailMessage): Promise<void> {
    const header = `[email] not sent, EMAIL_SENDER is CONSOLE. To: ${message.to}. Subject: ${message.subject}`;

    this.logger.warn(
      this.env.isProduction ? header : `${header}\n\n${message.text}`,
      ConsoleEmailSender.name,
    );

    return Promise.resolve();
  }
}
