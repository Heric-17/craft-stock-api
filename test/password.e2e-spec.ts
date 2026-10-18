import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';

import { HttpStatus, type INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import type { SessionResponse } from '../src/modules/auth/application/dto/auth.dto';
import { UsersService } from '../src/modules/users/application/services/users.service';
import {
  EMAIL_SENDER_FACTORY,
  type EmailMessage,
  type EmailSender,
  type EmailSenderFactory,
} from '../src/shared/domain/email/email-sender';
import { PrismaService } from '../src/shared/infrastructure/prisma/prisma.service';
import type { ErrorResponseBody } from '../src/shared/presentation/filters/all-exceptions.filter';
import { configureTestApp } from './support/configure-test-app';
import { refreshCookieHeader, requireRefreshToken } from './support/refresh-cookie';

/** Captures what the system would have mailed, so a test can follow the link. */
class RecordingEmailSender implements EmailSender, EmailSenderFactory {
  readonly sent: EmailMessage[] = [];

  send(message: EmailMessage): Promise<void> {
    this.sent.push(message);
    return Promise.resolve();
  }

  create(): EmailSender {
    return this;
  }

  to(address: string): EmailMessage[] {
    return this.sent.filter((message) => message.to.toLowerCase() === address.toLowerCase());
  }
}

/**
 * Changing a password and recovering one, end to end against a real database:
 * the sessions it closes and the ones it spares, the single-use link, and the
 * two things a public "I forgot" route must never do — reveal which addresses
 * have an account, or leave the link anywhere but the e-mail.
 */
describe('Password change and recovery (e2e)', () => {
  let app: INestApplication;
  let server: Server;
  let prisma: PrismaService;
  const mail = new RecordingEmailSender();

  const oldPassword = 'correct horse battery staple';
  const newPassword = 'a brand new passphrase';
  const createdUserIds: string[] = [];

  async function createUser(): Promise<{ id: string; email: string }> {
    const email = `password-e2e-${randomUUID()}@craftstock.dev`;
    const user = await app
      .get(UsersService)
      .register({ email, password: oldPassword, name: 'Ana Souza' });
    createdUserIds.push(user.id);

    return { id: user.id, email };
  }

  async function login(
    email: string,
    password = oldPassword,
  ): Promise<{ authHeader: string; refreshToken: string }> {
    const response = await request(server)
      .post('/auth/login')
      .send({ email, password })
      .expect(HttpStatus.OK);

    return {
      authHeader: `Bearer ${(response.body as SessionResponse).accessToken}`,
      refreshToken: requireRefreshToken(response),
    };
  }

  function refresh(token: string): request.Test {
    return request(server).post('/auth/refresh').set('Cookie', refreshCookieHeader(token));
  }

  function tokenFromMail(message: EmailMessage): string {
    const token = /#token=([0-9a-f]{64})/.exec(message.text)?.[1];

    if (token === undefined) {
      throw new Error('The reset e-mail carries no token.');
    }

    return token;
  }

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(EMAIL_SENDER_FACTORY)
      .useValue(mail)
      .compile();

    app = moduleRef.createNestApplication();
    configureTestApp(app, moduleRef);
    await app.init();
    server = app.getHttpServer() as Server;
    prisma = moduleRef.get(PrismaService);
  });

  afterAll(async () => {
    // RefreshToken and PasswordResetToken rows cascade with their User.
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await app.close();
  });

  describe('POST /auth/change-password', () => {
    it('changes the password, keeps this device signed in and signs the others out', async () => {
      const { email } = await createUser();
      const phone = await login(email);
      const computer = await login(email);

      await request(server)
        .post('/auth/change-password')
        .set('Authorization', computer.authHeader)
        .set('Cookie', refreshCookieHeader(computer.refreshToken))
        .send({ currentPassword: oldPassword, newPassword })
        .expect(HttpStatus.NO_CONTENT);

      await refresh(phone.refreshToken).expect(HttpStatus.UNAUTHORIZED);
      await refresh(computer.refreshToken).expect(HttpStatus.OK);
      await request(server)
        .post('/auth/login')
        .send({ email, password: oldPassword })
        .expect(HttpStatus.UNAUTHORIZED);
      await login(email, newPassword);
    });

    /**
     * 422, not 401: a client reads a 401 as "the session is gone", tries to
     * refresh and signs the person out — for a typo in a form field.
     */
    it('answers a wrong current password with a 422 and changes nothing', async () => {
      const { email } = await createUser();
      const session = await login(email);

      const response = await request(server)
        .post('/auth/change-password')
        .set('Authorization', session.authHeader)
        .set('Cookie', refreshCookieHeader(session.refreshToken))
        .send({ currentPassword: 'not the password', newPassword })
        .expect(HttpStatus.UNPROCESSABLE_ENTITY);

      expect((response.body as ErrorResponseBody).code).toBe('INVALID_CURRENT_PASSWORD');
      await refresh(session.refreshToken).expect(HttpStatus.OK);
      await login(email, oldPassword);
    });

    it('rejects a new password shorter than 8 characters, naming the field', async () => {
      const { email } = await createUser();
      const session = await login(email);

      const response = await request(server)
        .post('/auth/change-password')
        .set('Authorization', session.authHeader)
        .send({ currentPassword: oldPassword, newPassword: 'short' })
        .expect(HttpStatus.BAD_REQUEST);

      const body = response.body as ErrorResponseBody;
      expect(body.code).toBe('VALIDATION_FAILED');
      expect(JSON.stringify(body.details)).toContain('newPassword');
    });

    it('requires a signed-in user', async () => {
      await request(server)
        .post('/auth/change-password')
        .send({ currentPassword: oldPassword, newPassword })
        .expect(HttpStatus.UNAUTHORIZED);
    });
  });

  describe('POST /auth/forgot-password', () => {
    it('mails a link to a registered address and answers 204', async () => {
      const { email } = await createUser();

      await request(server)
        .post('/auth/forgot-password')
        .send({ email })
        .expect(HttpStatus.NO_CONTENT);

      const [message] = mail.to(email);
      expect(message.subject).toContain('Redefinição de senha');
      expect(message.text).toContain('/redefinir-senha#token=');
    });

    /** The answer is the same either way, so the route cannot be used to list accounts. */
    it('answers 204 for an address with no account, and sends nothing', async () => {
      const email = `nobody-${randomUUID()}@craftstock.dev`;

      const response = await request(server)
        .post('/auth/forgot-password')
        .send({ email })
        .expect(HttpStatus.NO_CONTENT);

      expect(response.body).toEqual({});
      expect(mail.to(email)).toEqual([]);
    });

    it('finds the account whatever case the address is typed in', async () => {
      const { email } = await createUser();

      await request(server)
        .post('/auth/forgot-password')
        .send({ email: email.toUpperCase() })
        .expect(HttpStatus.NO_CONTENT);

      expect(mail.to(email)).toHaveLength(1);
    });

    it('does not mail again while the cooldown runs', async () => {
      const { email } = await createUser();

      await request(server)
        .post('/auth/forgot-password')
        .send({ email })
        .expect(HttpStatus.NO_CONTENT);
      await request(server)
        .post('/auth/forgot-password')
        .send({ email })
        .expect(HttpStatus.NO_CONTENT);

      expect(mail.to(email)).toHaveLength(1);
    });

    it('rejects something that is not an address', async () => {
      await request(server)
        .post('/auth/forgot-password')
        .send({ email: 'not-an-email' })
        .expect(HttpStatus.BAD_REQUEST);
    });
  });

  describe('POST /auth/reset-password', () => {
    async function requestLink(email: string): Promise<string> {
      await request(server)
        .post('/auth/forgot-password')
        .send({ email })
        .expect(HttpStatus.NO_CONTENT);

      return tokenFromMail(mail.to(email).at(-1)!);
    }

    it('sets the new password, signs every device out and lets the person log in again', async () => {
      const { email } = await createUser();
      const phone = await login(email);
      const token = await requestLink(email);

      await request(server)
        .post('/auth/reset-password')
        .send({ token, newPassword })
        .expect(HttpStatus.NO_CONTENT);

      await refresh(phone.refreshToken).expect(HttpStatus.UNAUTHORIZED);
      await request(server)
        .post('/auth/login')
        .send({ email, password: oldPassword })
        .expect(HttpStatus.UNAUTHORIZED);
      await login(email, newPassword);
    });

    it('works only once', async () => {
      const { email } = await createUser();
      const token = await requestLink(email);
      await request(server)
        .post('/auth/reset-password')
        .send({ token, newPassword })
        .expect(HttpStatus.NO_CONTENT);

      const response = await request(server)
        .post('/auth/reset-password')
        .send({ token, newPassword: 'yet another passphrase' })
        .expect(HttpStatus.UNPROCESSABLE_ENTITY);

      expect((response.body as ErrorResponseBody).code).toBe('INVALID_PASSWORD_RESET_TOKEN');
      await login(email, newPassword);
    });

    it('refuses a token that was never issued', async () => {
      const response = await request(server)
        .post('/auth/reset-password')
        .send({ token: 'f'.repeat(64), newPassword })
        .expect(HttpStatus.UNPROCESSABLE_ENTITY);

      expect((response.body as ErrorResponseBody).code).toBe('INVALID_PASSWORD_RESET_TOKEN');
    });

    it('refuses a link that expired', async () => {
      const { id, email } = await createUser();
      const token = await requestLink(email);
      await prisma.passwordResetToken.updateMany({
        where: { userId: id },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });

      await request(server)
        .post('/auth/reset-password')
        .send({ token, newPassword })
        .expect(HttpStatus.UNPROCESSABLE_ENTITY);
    });

    it('rejects a new password shorter than 8 characters without spending the link', async () => {
      const { email } = await createUser();
      const token = await requestLink(email);

      await request(server)
        .post('/auth/reset-password')
        .send({ token, newPassword: 'short' })
        .expect(HttpStatus.BAD_REQUEST);

      await request(server)
        .post('/auth/reset-password')
        .send({ token, newPassword })
        .expect(HttpStatus.NO_CONTENT);
    });

    it('is undone by changing the password in the meantime', async () => {
      const { email } = await createUser();
      const token = await requestLink(email);
      const session = await login(email);
      await request(server)
        .post('/auth/change-password')
        .set('Authorization', session.authHeader)
        .set('Cookie', refreshCookieHeader(session.refreshToken))
        .send({ currentPassword: oldPassword, newPassword })
        .expect(HttpStatus.NO_CONTENT);

      await request(server)
        .post('/auth/reset-password')
        .send({ token, newPassword: 'yet another passphrase' })
        .expect(HttpStatus.UNPROCESSABLE_ENTITY);
    });
  });

  describe('what is kept at rest', () => {
    it('stores only a hash of the token, and never the token in the audit trail', async () => {
      const { id, email } = await createUser();
      await request(server)
        .post('/auth/forgot-password')
        .send({ email })
        .expect(HttpStatus.NO_CONTENT);
      const token = tokenFromMail(mail.to(email)[0]);

      const rows = await prisma.passwordResetToken.findMany({ where: { userId: id } });
      expect(rows).toHaveLength(1);
      expect(rows[0].tokenHash).not.toBe(token);
      expect(rows[0].tokenHash).toHaveLength(64);

      const audit = await prisma.auditLog.findMany({ where: { entityType: 'PasswordResetToken' } });
      expect(JSON.stringify(audit)).not.toContain(token);
    });
  });
});
