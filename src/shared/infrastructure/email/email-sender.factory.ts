import { Injectable } from '@nestjs/common';

import { EnvService } from '../../../config/env.service';
import type { EmailSender, EmailSenderFactory } from '../../domain/email/email-sender';
import { ConsoleEmailSender } from './console-email.sender';
import { SmtpEmailSender } from './smtp-email.sender';

/**
 * Chooses the e-mail channel for the whole installation from `EMAIL_SENDER`.
 *
 * Both senders arrive through the constructor, already built by the
 * container, and this class only ever picks one — never `new`.
 */
@Injectable()
export class EnvEmailSenderFactory implements EmailSenderFactory {
  constructor(
    private readonly console: ConsoleEmailSender,
    private readonly smtp: SmtpEmailSender,
    private readonly env: EnvService,
  ) {}

  create(): EmailSender {
    switch (this.env.get('EMAIL_SENDER')) {
      case 'SMTP':
        return this.smtp;
      case 'CONSOLE':
        return this.console;
    }
  }
}
