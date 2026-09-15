/**
 * Base class for every rule violation expressed by the domain. Pure TypeScript:
 * no framework, no HTTP status, no infrastructure. The presentation layer is
 * what decides how a domain error is rendered over the wire.
 */
export abstract class DomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
    Error.captureStackTrace?.(this, new.target);
  }
}
