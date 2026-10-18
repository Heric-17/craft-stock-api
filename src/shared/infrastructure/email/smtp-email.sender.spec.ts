import type { EnvService } from '../../../config/env.service';
import { SmtpEmailSender } from './smtp-email.sender';

type EnvValues = Record<string, unknown>;

function senderWith(values: EnvValues): SmtpEmailSender {
  const env = { get: (key: string) => values[key] } as unknown as EnvService;

  return new SmtpEmailSender(env);
}

const MESSAGE = { to: 'ana@exemplo.com', subject: 'Assunto', text: 'corpo' };

/**
 * No mail server is contacted here: what is worth pinning down without one is
 * that a missing configuration fails loudly instead of dropping the message,
 * and that nothing is built before the first send.
 */
describe('SmtpEmailSender', () => {
  it('refuses to send without a sender address', async () => {
    const sender = senderWith({ SMTP_HOST: 'smtp.example.com', EMAIL_FROM: undefined });

    await expect(sender.send(MESSAGE)).rejects.toThrow('EMAIL_FROM');
  });

  it('refuses to send without a host', async () => {
    const sender = senderWith({ SMTP_HOST: undefined, EMAIL_FROM: 'no-reply@example.com' });

    await expect(sender.send(MESSAGE)).rejects.toThrow('SMTP_HOST');
  });

  it('builds nothing while it is merely constructed', () => {
    const get = jest.fn();

    expect(() => new SmtpEmailSender({ get } as unknown as EnvService)).not.toThrow();
    expect(get).not.toHaveBeenCalled();
  });
});
