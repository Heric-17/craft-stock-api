import { isSensitiveField, redactSensitiveText } from './sensitive-data';

/**
 * Why a request failed, in the four fields the request record keeps: the
 * class of the failure, its message, its stack, and a short context.
 *
 * Every string here has already been through `redactSensitiveText` and been
 * truncated — nothing further downstream is expected to sanitize it again.
 */
export interface RequestErrorDetails {
  errorType: string;
  errorMessage: string;
  stackTrace: string | null;
  errorContext: string | null;
}

const MAX_MESSAGE_LENGTH = 500;
const MAX_STACK_LENGTH = 8_000;
const MAX_CONTEXT_LENGTH = 2_000;
const MAX_CONTEXT_VALUE_LENGTH = 200;
const MAX_CONTEXT_ENTRIES = 12;

/** Already on the interface as columns of their own — repeating them in the context is noise. */
const NEVER_IN_CONTEXT = new Set(['name', 'message', 'stack']);

/**
 * Describes an unknown thrown value for the request record.
 *
 * Pure, and pure on purpose: what may be written about a failure is a rule,
 * not a persistence concern, so it is decided here and tested here rather
 * than inside the filter that happens to call it.
 *
 * The context is built from scalar properties only. That is what keeps a
 * whole captured invoice, a request body or an entity payload out of the
 * record: an object-valued property is dropped rather than serialized, so
 * bulk data cannot arrive here by being attached to an error.
 */
export function describeFailure(
  exception: unknown,
  extra: Readonly<Record<string, unknown>> = {},
): RequestErrorDetails {
  return {
    errorType: errorTypeOf(exception),
    errorMessage: sanitize(messageOf(exception), MAX_MESSAGE_LENGTH),
    stackTrace:
      exception instanceof Error && exception.stack
        ? sanitize(exception.stack, MAX_STACK_LENGTH)
        : null,
    errorContext: buildContext(exception, extra),
  };
}

function errorTypeOf(exception: unknown): string {
  if (exception instanceof Error) {
    return exception.name || exception.constructor.name;
  }

  return `NonError(${typeof exception})`;
}

function messageOf(exception: unknown): string {
  if (exception instanceof Error) {
    return exception.message;
  }

  if (isScalar(exception)) {
    return String(exception);
  }

  // Anything else is stringified only as its type: `JSON.stringify` of an
  // arbitrary thrown object is exactly the payload dump this must not write.
  return `A non-Error value of type ${typeof exception} was thrown`;
}

function buildContext(exception: unknown, extra: Readonly<Record<string, unknown>>): string | null {
  const context: Record<string, string> = {};

  for (const [key, value] of Object.entries(extra)) {
    add(context, key, value);
  }

  if (exception !== null && typeof exception === 'object') {
    for (const [key, value] of Object.entries(exception)) {
      if (!NEVER_IN_CONTEXT.has(key)) {
        add(context, key, value);
      }
    }
  }

  if (exception instanceof Error && exception.cause instanceof Error) {
    add(context, 'cause', `${exception.cause.name}: ${exception.cause.message}`);
  }

  if (Object.keys(context).length === 0) {
    return null;
  }

  return sanitize(JSON.stringify(context), MAX_CONTEXT_LENGTH);
}

function add(context: Record<string, string>, key: string, value: unknown): void {
  if (isSensitiveField(key) || Object.keys(context).length >= MAX_CONTEXT_ENTRIES) {
    return;
  }

  const rendered = renderValue(value);

  if (rendered !== null) {
    context[key] = truncate(rendered, MAX_CONTEXT_VALUE_LENGTH);
  }
}

/**
 * Scalars as themselves, a list of scalars joined (which is what a validation
 * failure's list of violations is), and everything else dropped.
 */
function renderValue(value: unknown): string | null {
  if (isScalar(value)) {
    return String(value);
  }

  if (Array.isArray(value) && value.every(isScalar)) {
    return value.map(String).join('; ');
  }

  return null;
}

function isScalar(value: unknown): boolean {
  return (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'bigint'
  );
}

function sanitize(text: string, limit: number): string {
  return truncate(redactSensitiveText(text), limit);
}

function truncate(text: string, limit: number): string {
  return text.length <= limit ? text : `${text.slice(0, limit)}…[truncated]`;
}
