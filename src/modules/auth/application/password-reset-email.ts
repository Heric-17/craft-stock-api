import type { EmailMessage } from '../../../shared/domain/email/email-sender';
import { PASSWORD_RESET_TOKEN_TTL_MS } from '../domain/password-reset-token.entity';

/**
 * Only a development machine or the test suite ever falls back to this:
 * `WEB_APP_URL` is required in production (enforced in `envSchema`), so an
 * installation cannot boot and mail out links to the loopback address.
 */
const DEVELOPMENT_WEB_APP_URL = 'http://localhost:5173';

/** Route of the "choose a new password" screen in the web app. */
const RESET_PASSWORD_PATH = '/redefinir-senha';

/**
 * The link in the reset e-mail. The token travels in the fragment, not the
 * query string: a fragment is never sent to a server, so it stays out of the
 * web server's access log and out of the `Referer` header of anything the
 * page loads.
 */
export function buildPasswordResetLink(webAppUrl: string | undefined, rawToken: string): string {
  const base = (webAppUrl ?? DEVELOPMENT_WEB_APP_URL).replace(/\/+$/, '');

  return `${base}${RESET_PASSWORD_PATH}#token=${rawToken}`;
}

/**
 * The message is written for the person who asked for it, so it is in
 * Portuguese: unlike an API error, nothing translates it afterwards.
 */
export function composePasswordResetEmail(input: {
  to: string;
  name: string;
  link: string;
}): EmailMessage {
  const minutes = PASSWORD_RESET_TOKEN_TTL_MS / 60_000;

  return {
    to: input.to,
    subject: 'Redefinição de senha do CraftStock',
    text: [
      `Olá, ${input.name}.`,
      '',
      'Recebemos um pedido para redefinir a senha da sua conta no CraftStock.',
      'Para escolher uma nova senha, abra o link abaixo:',
      '',
      input.link,
      '',
      `O link vale por ${minutes} minutos e só pode ser usado uma vez.`,
      'Se você não pediu isso, ignore esta mensagem: sua senha continua a mesma.',
    ].join('\n'),
  };
}
