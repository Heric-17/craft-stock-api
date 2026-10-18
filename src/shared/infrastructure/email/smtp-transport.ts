import { createTransport, type Transporter } from 'nodemailer';

import type { EnvService } from '../../../config/env.service';

/**
 * The SMTP connection both mail senders use, built from the one set of
 * `SMTP_*` variables. Called on first use rather than at construction: the
 * container builds every sender whichever one the factory will pick, and the
 * credentials are only required of the one in use.
 */
export function createSmtpTransporter(env: EnvService): Transporter {
  const host = env.get('SMTP_HOST');

  if (!host) {
    throw new Error('SMTP_HOST is required to send e-mail by SMTP.');
  }

  const user = env.get('SMTP_USER');
  const password = env.get('SMTP_PASSWORD');

  return createTransport({
    host,
    port: env.get('SMTP_PORT'),
    secure: env.get('SMTP_SECURE'),
    ...(user && password ? { auth: { user, pass: password } } : {}),
  });
}
