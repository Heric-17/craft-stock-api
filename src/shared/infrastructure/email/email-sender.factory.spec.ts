import type { EnvService } from '../../../config/env.service';
import type { EmailSenderKind } from '../../../config/env.schema';
import type { StructuredLogger } from '../logging/structured-logger.service';
import { ConsoleEmailSender } from './console-email.sender';
import { EnvEmailSenderFactory } from './email-sender.factory';
import { SmtpEmailSender } from './smtp-email.sender';

function buildFactory(kind: EmailSenderKind): {
  factory: EnvEmailSenderFactory;
  console: ConsoleEmailSender;
  smtp: SmtpEmailSender;
} {
  // Every implementation is built once and handed to the factory, as the
  // container does it. The factory has to return one of these very instances.
  const env = { get: () => kind } as unknown as EnvService;
  const consoleSender = new ConsoleEmailSender({} as StructuredLogger, {} as EnvService);
  const smtp = new SmtpEmailSender(env);

  return {
    factory: new EnvEmailSenderFactory(consoleSender, smtp, env),
    console: consoleSender,
    smtp,
  };
}

describe('EnvEmailSenderFactory', () => {
  it('selects the console sender', () => {
    const { factory, console: consoleSender } = buildFactory('CONSOLE');

    expect(factory.create()).toBe(consoleSender);
  });

  it('selects the SMTP sender', () => {
    const { factory, smtp } = buildFactory('SMTP');

    expect(factory.create()).toBe(smtp);
  });
});
