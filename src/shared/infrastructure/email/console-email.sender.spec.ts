import type { EnvService } from '../../../config/env.service';
import type { StructuredLogger } from '../logging/structured-logger.service';
import { ConsoleEmailSender } from './console-email.sender';

const message = {
  to: 'ana@exemplo.com',
  subject: 'Assunto',
  text: 'https://app/redefinir-senha#token=secret-value',
};

function build(isProduction: boolean) {
  const warn = jest.fn();
  const sender = new ConsoleEmailSender(
    { warn } as unknown as StructuredLogger,
    { isProduction } as unknown as EnvService,
  );

  return { warn, sender };
}

describe('ConsoleEmailSender', () => {
  it('records who the message was for and its subject', async () => {
    const { warn, sender } = build(false);

    await sender.send(message);

    const [logged] = warn.mock.calls[0] as [string];
    expect(logged).toContain('ana@exemplo.com');
    expect(logged).toContain('Assunto');
  });

  it('writes the body outside production, so the link can be read in development', async () => {
    const { warn, sender } = build(false);

    await sender.send(message);

    expect(JSON.stringify(warn.mock.calls)).toContain('secret-value');
  });

  /**
   * The body of these messages is a one-time link. In production a log is where
   * it must not end up, even if the installation was left on this channel.
   */
  it('never writes the body in production', async () => {
    const { warn, sender } = build(true);

    await sender.send(message);

    const [logged] = warn.mock.calls[0] as [string];
    expect(logged).toContain('ana@exemplo.com');
    expect(JSON.stringify(warn.mock.calls)).not.toContain('secret-value');
  });
});
