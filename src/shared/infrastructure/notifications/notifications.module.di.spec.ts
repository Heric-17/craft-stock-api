import { Test, type TestingModule } from '@nestjs/testing';

import { EnvService } from '../../../config/env.service';
import type { NotificationSenderKind } from '../../../config/env.schema';
import { ErrorAlertService } from '../../application/observability/error-alert.service';
import {
  NOTIFICATION_SENDER_FACTORY,
  type NotificationSenderFactory,
} from '../../domain/notifications/notification-sender';
import { ConsoleNotificationSender } from './console-notification.sender';
import { NotificationsModule } from './notifications.module';
import { SmtpNotificationSender } from './smtp-notification.sender';

/**
 * Builds the module through the real container, catching a token mismatch or a
 * missing registration that a fake-based service test would never see.
 *
 * `EnvService` is pinned rather than inherited from `.env`: the selection is
 * the whole subject of this test. That the schema defaults
 * `NOTIFICATION_SENDER` to `CONSOLE` is asserted where the default lives, in
 * `env.schema.spec.ts`.
 */
describe('NotificationsModule wiring', () => {
  function compileWith(kind: NotificationSenderKind): Promise<TestingModule> {
    return Test.createTestingModule({ imports: [NotificationsModule] })
      .overrideProvider(EnvService)
      .useValue({ get: () => kind })
      .compile();
  }

  /**
   * The acceptance criterion for the Factory pattern: the factory hands back
   * the very instance the container built, never one of its own.
   */
  it.each([
    ['CONSOLE', ConsoleNotificationSender],
    ['SMTP', SmtpNotificationSender],
  ] as const)(
    'resolves the factory through the container and selects %s',
    async (kind, expected) => {
      const moduleRef = await compileWith(kind);

      const factory = moduleRef.get<NotificationSenderFactory>(NOTIFICATION_SENDER_FACTORY);

      expect(factory.create()).toBe(moduleRef.get(expected));

      await moduleRef.close();
    },
  );

  it('registers both senders, so the factory never has to construct one', async () => {
    const moduleRef = await compileWith('CONSOLE');

    expect(moduleRef.get(ConsoleNotificationSender)).toBeInstanceOf(ConsoleNotificationSender);
    expect(moduleRef.get(SmtpNotificationSender)).toBeInstanceOf(SmtpNotificationSender);

    await moduleRef.close();
  });

  /**
   * What the global exception filter depends on. It is resolved by token
   * against the contract, so the service it gets knows only
   * `NotificationSender` — never which channel is configured.
   */
  it('exposes the alert service, wired to the selected channel', async () => {
    const moduleRef = await compileWith('CONSOLE');

    expect(moduleRef.get(ErrorAlertService)).toBeInstanceOf(ErrorAlertService);

    await moduleRef.close();
  });
});
