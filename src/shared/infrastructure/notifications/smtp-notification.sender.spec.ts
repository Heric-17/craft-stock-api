import type { EnvService } from '../../../config/env.service';
import { SmtpNotificationSender } from './smtp-notification.sender';

type EnvValues = Record<string, unknown>;

function senderWith(values: EnvValues): SmtpNotificationSender {
  const env = { get: (key: string) => values[key] } as unknown as EnvService;

  return new SmtpNotificationSender(env);
}

/**
 * No mail server is contacted here. What is worth pinning down without one is
 * that a missing configuration fails loudly instead of silently dropping the
 * alert, and that nothing is built before the first send — the container
 * builds this sender even on an installation that has `CONSOLE` selected.
 */
describe('SmtpNotificationSender', () => {
  it('refuses to send without a recipient', async () => {
    const sender = senderWith({
      SMTP_HOST: 'smtp.example.com',
      ALERT_EMAIL_FROM: 'alerts@example.com',
      ALERT_EMAIL_TO: undefined,
    });

    await expect(sender.send('subject', 'body')).rejects.toThrow('ALERT_EMAIL_TO');
  });

  it('refuses to send without a host', async () => {
    const sender = senderWith({
      SMTP_HOST: undefined,
      ALERT_EMAIL_FROM: 'alerts@example.com',
      ALERT_EMAIL_TO: 'dev@example.com',
    });

    await expect(sender.send('subject', 'body')).rejects.toThrow('SMTP_HOST');
  });

  it('builds nothing while it is merely constructed', () => {
    const get = jest.fn();

    expect(() => new SmtpNotificationSender({ get } as unknown as EnvService)).not.toThrow();
    expect(get).not.toHaveBeenCalled();
  });
});
