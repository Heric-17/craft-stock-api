import type { StructuredLogger } from '../logging/structured-logger.service';
import { ConsoleNotificationSender } from './console-notification.sender';

describe('ConsoleNotificationSender', () => {
  it('writes the alert to the log, subject and body', async () => {
    const warn = jest.fn();
    const sender = new ConsoleNotificationSender({ warn } as unknown as StructuredLogger);

    await sender.send('[CraftStock] 500 Error on POST /sales', 'errorId: corr-1');

    const [message] = warn.mock.calls[0] as [string];
    expect(message).toContain('[CraftStock] 500 Error on POST /sales');
    expect(message).toContain('errorId: corr-1');
  });

  /** Nothing to configure and nothing that can leave the machine. */
  it('resolves without any transport', async () => {
    const sender = new ConsoleNotificationSender({
      warn: jest.fn(),
    } as unknown as StructuredLogger);

    await expect(sender.send('subject', 'body')).resolves.toBeUndefined();
  });
});
