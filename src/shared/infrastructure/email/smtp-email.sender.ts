import { Injectable } from '@nestjs/common';
import type { Transporter } from 'nodemailer';

import { EnvService } from '../../../config/env.service';
import type { EmailMessage, EmailSender } from '../../domain/email/email-sender';
import { createSmtpTransporter } from './smtp-transport';

/** The production channel: the message goes out through the configured SMTP server. */
@Injectable()
export class SmtpEmailSender implements EmailSender {
  private transporter?: Transporter;

  constructor(private readonly env: EnvService) {}

  async send(message: EmailMessage): Promise<void> {
    const from = this.env.get('EMAIL_FROM');

    if (!from) {
      throw new Error('EMAIL_FROM is required to send e-mail by SMTP.');
    }

    this.transporter ??= createSmtpTransporter(this.env);

    await this.transporter.sendMail({
      from,
      to: message.to,
      subject: message.subject,
      text: message.text,
    });
  }
}
