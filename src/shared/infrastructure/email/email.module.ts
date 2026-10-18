import { Module } from '@nestjs/common';

import { EnvModule } from '../../../config/env.module';
import { EMAIL_SENDER_FACTORY } from '../../domain/email/email-sender';
import { LoggingModule } from '../logging/logging.module';
import { ConsoleEmailSender } from './console-email.sender';
import { EnvEmailSenderFactory } from './email-sender.factory';
import { SmtpEmailSender } from './smtp-email.sender';

/** Composition root for mail to a person: the two channels and the factory that selects between them. */
@Module({
  imports: [EnvModule, LoggingModule],
  providers: [
    // Registered so the container builds each one with its own dependencies.
    // The factory receives them and only ever selects.
    ConsoleEmailSender,
    SmtpEmailSender,
    { provide: EMAIL_SENDER_FACTORY, useClass: EnvEmailSenderFactory },
  ],
  exports: [EMAIL_SENDER_FACTORY],
})
export class EmailModule {}
