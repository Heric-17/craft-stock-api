import type { EnvService } from '../../../config/env.service';
import type { NotificationSenderKind } from '../../../config/env.schema';
import type { StructuredLogger } from '../logging/structured-logger.service';
import { ConsoleNotificationSender } from './console-notification.sender';
import { EnvNotificationSenderFactory } from './notification-sender.factory';
import { SmtpNotificationSender } from './smtp-notification.sender';

const NEVER_CALLED_LOGGER = {
  warn: () => {
    throw new Error('The factory must not send anything while selecting a channel.');
  },
} as unknown as StructuredLogger;

function buildFactory(kind: NotificationSenderKind): {
  factory: EnvNotificationSenderFactory;
  console: ConsoleNotificationSender;
  smtp: SmtpNotificationSender;
} {
  // Every implementation is built once and handed to the factory, exactly as
  // the container does it. The factory is expected to return one of these
  // very instances — never something it constructed itself.
  const env = { get: () => kind } as unknown as EnvService;
  const consoleSender = new ConsoleNotificationSender(NEVER_CALLED_LOGGER);
  const smtp = new SmtpNotificationSender(env);

  return {
    factory: new EnvNotificationSenderFactory(consoleSender, smtp, env),
    console: consoleSender,
    smtp,
  };
}

describe('EnvNotificationSenderFactory', () => {
  it('selects the console sender in development', () => {
    const { factory, console: consoleSender } = buildFactory('CONSOLE');

    expect(factory.create()).toBe(consoleSender);
  });

  it('selects the SMTP sender in production', () => {
    const { factory, smtp } = buildFactory('SMTP');

    expect(factory.create()).toBe(smtp);
  });

  /**
   * The factory only ever selects. An implementation built here with `new`
   * would sit outside the container, without the dependencies, scope and
   * lifecycle the container gave it.
   */
  it('returns the very instance it was given, never a new one', () => {
    const { factory, console: consoleSender } = buildFactory('CONSOLE');

    expect(factory.create()).toBe(consoleSender);
    expect(factory.create()).toBe(consoleSender);
  });

  it('switches channel purely from configuration, with no change at any call site', () => {
    const dev = buildFactory('CONSOLE');
    const prod = buildFactory('SMTP');

    expect(dev.factory.create()).toBe(dev.console);
    expect(prod.factory.create()).toBe(prod.smtp);
  });
});
