export const NOTIFICATION_SENDER_FACTORY = Symbol('NOTIFICATION_SENDER_FACTORY');

/**
 * How an operational alert leaves the system. One method, two arguments: the
 * caller states what happened and never how it travels.
 *
 * `send` is expected to reject when delivery fails. Callers treat an alert as
 * a side effect and never let that rejection reach the work that raised it —
 * an unsent warning is a worse outcome than no warning only if it also takes
 * the request down with it.
 */
export interface NotificationSender {
  send(subject: string, body: string): Promise<void>;
}

/**
 * Picks the sender for the running installation. Adding a channel (Discord,
 * Telegram, a webhook) is a new implementation plus one line in this factory:
 * nothing that raises an alert changes, because nothing that raises an alert
 * knows more than the interface above.
 */
export interface NotificationSenderFactory {
  create(): NotificationSender;
}
