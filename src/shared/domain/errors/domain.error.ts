import { toErrorCode } from './error-code';

/**
 * Base class for every rule violation expressed by the domain. Pure TypeScript:
 * no framework, no HTTP status, no infrastructure. The presentation layer is
 * what decides how a domain error is rendered over the wire.
 *
 * Two things travel with every one of them:
 *
 * - `code`, a stable identifier in SCREAMING_SNAKE_CASE derived from the
 *   class name. It is the public contract the client branches and translates
 *   on; `message` stays English and exists for the log. Changing a code is a
 *   breaking change, which is why it is derived from the class name and
 *   documented in docs/api-contract.md rather than typed in by hand.
 * - `details`, optional and typed per error: the few facts a screen needs to
 *   say something useful, as data instead of a sentence to parse. The type
 *   parameter is what keeps each error's shape honest at compile time.
 */
export abstract class DomainError<TDetails = undefined> extends Error {
  readonly code: string;
  readonly details?: TDetails;

  constructor(message: string, details?: TDetails) {
    super(message);
    this.name = new.target.name;
    this.code = toErrorCode(new.target.name);

    if (details !== undefined) {
      this.details = details;
    }

    Error.captureStackTrace?.(this, new.target);
  }
}
