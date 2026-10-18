export const EMAIL_SENDER_FACTORY = Symbol('EMAIL_SENDER_FACTORY');

export interface EmailMessage {
  to: string;
  subject: string;
  /** Plain text. The messages this system sends are a sentence and a link. */
  text: string;
}

/**
 * How a message to one person leaves the system. Distinct from
 * `NotificationSender`, which tells the maintainer something went wrong and
 * always goes to the same address: here the recipient is whoever the message
 * is about.
 *
 * `send` is expected to reject when delivery fails; what the caller does about
 * that is the caller's decision.
 */
export interface EmailSender {
  send(message: EmailMessage): Promise<void>;
}

/** Picks the sender for the running installation. */
export interface EmailSenderFactory {
  create(): EmailSender;
}
