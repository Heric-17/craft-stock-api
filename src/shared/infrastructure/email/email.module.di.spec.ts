import { Test, type TestingModule } from '@nestjs/testing';

import { EnvService } from '../../../config/env.service';
import type { EmailSenderKind } from '../../../config/env.schema';
import { EMAIL_SENDER_FACTORY, type EmailSenderFactory } from '../../domain/email/email-sender';
import { ConsoleEmailSender } from './console-email.sender';
import { EmailModule } from './email.module';
import { SmtpEmailSender } from './smtp-email.sender';

/**
 * Builds the module through the real container, catching a token mismatch or a
 * missing registration that a test with hand-built objects would never see.
 */
describe('EmailModule wiring', () => {
  function compileWith(kind: EmailSenderKind): Promise<TestingModule> {
    return Test.createTestingModule({ imports: [EmailModule] })
      .overrideProvider(EnvService)
      .useValue({ get: () => kind })
      .compile();
  }

  it.each([
    ['CONSOLE', ConsoleEmailSender],
    ['SMTP', SmtpEmailSender],
  ] as const)(
    'resolves the factory through the container and selects %s',
    async (kind, expected) => {
      const moduleRef = await compileWith(kind);

      const factory = moduleRef.get<EmailSenderFactory>(EMAIL_SENDER_FACTORY);

      expect(factory.create()).toBe(moduleRef.get(expected));

      await moduleRef.close();
    },
  );
});
