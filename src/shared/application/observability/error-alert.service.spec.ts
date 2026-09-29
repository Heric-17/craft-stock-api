import type { EnvService } from '../../../config/env.service';
import type {
  NotificationSender,
  NotificationSenderFactory,
} from '../../domain/notifications/notification-sender';
import type { StructuredLogger } from '../../infrastructure/logging/structured-logger.service';
import { ErrorAlertService, type ServerErrorAlert } from './error-alert.service';

const THROTTLE_SECONDS = 300;

interface Harness {
  service: ErrorAlertService;
  send: jest.Mock;
  create: jest.Mock;
  loggerError: jest.Mock;
  notify: (overrides?: Partial<ServerErrorAlert>) => Promise<void>;
}

function harness(throttleSeconds = THROTTLE_SECONDS): Harness {
  const send = jest.fn<Promise<void>, [string, string]>().mockResolvedValue(undefined);
  const sender: NotificationSender = { send };
  const create = jest.fn().mockReturnValue(sender);
  const senders = { create } as unknown as NotificationSenderFactory;
  const loggerError = jest.fn();

  const service = new ErrorAlertService(
    senders,
    { get: () => throttleSeconds } as unknown as EnvService,
    { error: loggerError } as unknown as StructuredLogger,
  );

  return {
    service,
    send,
    create,
    loggerError,
    notify: (overrides = {}) =>
      service.notifyServerError({
        errorType: 'Error',
        message: 'boom',
        route: '/materials/:id',
        httpMethod: 'PATCH',
        statusCode: 500,
        correlationId: 'corr-1',
        ...overrides,
      }),
  };
}

describe('ErrorAlertService', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('sends the alert through the selected sender', async () => {
    const h = harness();

    await h.notify();

    expect(h.create).toHaveBeenCalled();
    expect(h.send).toHaveBeenCalledTimes(1);
  });

  it('names the route, the method, the status and the error type in the subject', async () => {
    const h = harness();

    await h.notify({ errorType: 'PrismaClientKnownRequestError' });

    const [subject] = h.send.mock.calls[0] as [string, string];
    expect(subject).toContain('500');
    expect(subject).toContain('PrismaClientKnownRequestError');
    expect(subject).toContain('PATCH /materials/:id');
  });

  /** The alert is only actionable if it carries what the caller was handed. */
  it('carries the errorId in the body', async () => {
    const h = harness();

    await h.notify({ correlationId: 'the-error-id' });

    const [, body] = h.send.mock.calls[0] as [string, string];
    expect(body).toContain('the-error-id');
  });

  describe('throttling per errorType', () => {
    /**
     * The point of the throttle: an error inside a loop is one message, not
     * three hundred.
     */
    it('sends once for a burst of the same error type', async () => {
      const h = harness();

      for (let i = 0; i < 50; i += 1) {
        await h.notify();
      }

      expect(h.send).toHaveBeenCalledTimes(1);
    });

    it('does not throttle a different error type', async () => {
      const h = harness();

      await h.notify({ errorType: 'Error' });
      await h.notify({ errorType: 'InvoiceStructureChangedError' });

      expect(h.send).toHaveBeenCalledTimes(2);
    });

    it('sends again once the window has passed', async () => {
      const h = harness();

      await h.notify();
      jest.advanceTimersByTime(THROTTLE_SECONDS * 1_000);
      await h.notify();

      expect(h.send).toHaveBeenCalledTimes(2);
    });

    it('reports how many occurrences were suppressed meanwhile', async () => {
      const h = harness();

      await h.notify();
      await h.notify();
      await h.notify();
      jest.advanceTimersByTime(THROTTLE_SECONDS * 1_000);
      await h.notify();

      const [, body] = h.send.mock.calls[1] as [string, string];
      expect(body).toContain('2 further occurrence(s)');
    });

    it('starts counting again after the alert that reported the suppressed ones', async () => {
      const h = harness();

      await h.notify();
      await h.notify();
      jest.advanceTimersByTime(THROTTLE_SECONDS * 1_000);
      await h.notify();
      jest.advanceTimersByTime(THROTTLE_SECONDS * 1_000);
      await h.notify();

      const [, body] = h.send.mock.calls[2] as [string, string];
      expect(body).not.toContain('further occurrence');
    });

    it('never throttles when the window is zero', async () => {
      const h = harness(0);

      await h.notify();
      await h.notify();

      expect(h.send).toHaveBeenCalledTimes(2);
    });
  });

  /**
   * An alert is a side effect of something that already went wrong. A channel
   * that is also down must not turn one failure into two.
   */
  describe('a failing channel', () => {
    it('resolves rather than rejecting when the send fails', async () => {
      const h = harness();
      h.send.mockRejectedValueOnce(new Error('smtp down'));

      await expect(h.notify()).resolves.toBeUndefined();
    });

    it('logs the delivery failure', async () => {
      const h = harness();
      h.send.mockRejectedValueOnce(new Error('smtp down'));

      await h.notify();

      expect(h.loggerError).toHaveBeenCalledTimes(1);
    });

    it('resolves when the factory itself throws', async () => {
      const h = harness();
      h.create.mockImplementationOnce(() => {
        throw new Error('no channel configured');
      });

      await expect(h.notify()).resolves.toBeUndefined();
      expect(h.loggerError).toHaveBeenCalledTimes(1);
    });
  });
});
