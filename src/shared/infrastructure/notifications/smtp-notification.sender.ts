import { Injectable } from '@nestjs/common';
import type { Transporter } from 'nodemailer';

import { EnvService } from '../../../config/env.service';
import type { NotificationSender } from '../../domain/notifications/notification-sender';
import { createSmtpTransporter } from '../email/smtp-transport';

/**
 * The production channel: e-mail to whoever maintains the installation.
 *
 * The transport is built on first use, not in the constructor. The container
 * builds every sender regardless of which one the factory will pick, and SMTP
 * credentials are only required when SMTP is the selected channel — building
 * eagerly would make a development boot demand a mail server it never talks
 * to.
 */
@Injectable()
export class SmtpNotificationSender implements NotificationSender {
  private transporter?: Transporter;

  constructor(private readonly env: EnvService) {}

  async send(subject: string, body: string): Promise<void> {
    const from = this.env.get('ALERT_EMAIL_FROM');
    const to = this.env.get('ALERT_EMAIL_TO');

    if (!from || !to) {
      throw new Error('ALERT_EMAIL_FROM and ALERT_EMAIL_TO are required to send an alert by SMTP.');
    }

    this.transporter ??= createSmtpTransporter(this.env);

    // Plain text only, and the body is already redacted and truncated by
    // whoever composed it. An alert is a pointer to the request record, not a
    // copy of it.
    await this.transporter.sendMail({ from, to, subject, text: body });
  }
}
