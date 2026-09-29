/**
 * §16, in one place: a password, a password hash, a token and a CPF are never
 * persisted and never logged. Two shapes of the same rule live here — by
 * field name, for a structured diff, and by content, for free text such as an
 * error message or a stack trace — because there is one list of what must not
 * be written, not one per consumer.
 */
const SENSITIVE_FIELD_PATTERN = /password|hash|token|cpf/i;

export function isSensitiveField(fieldName: string): boolean {
  return SENSITIVE_FIELD_PATTERN.test(fieldName);
}

const REDACTED = '[REDACTED]';

/**
 * A sensitive name followed by its value, in any of the notations that turn up
 * in a message or a serialized payload: `password=x`, `password: x`,
 * `"tokenHash":"x"`. The name is kept, the value is not — knowing which field
 * was involved is what makes an error legible, and the value is what must
 * never be stored.
 */
const SENSITIVE_ASSIGNMENT =
  /(["'`]?)([\w.-]*(?:password|hash|token|cpf)[\w.-]*)\1\s*[:=]\s*(?:"[^"]*"|'[^']*'|`[^`]*`|[^\s,;&)}\]]*)/gi;

/** A JWT, whether or not it is introduced by a field name — three base64url runs. */
const JWT = /\beyJ[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*/g;

/** An `Authorization: Bearer ...` header echoed into a message. */
const BEARER = /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi;

const CPF_FORMATTED = /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g;

/**
 * A bare CPF. Bounded by non-digits on both sides so a 14-digit CNPJ — which
 * is not sensitive and is a legitimate part of an import failure — does not
 * match on the eleven digits inside it.
 */
const CPF_BARE = /(?<!\d)\d{11}(?!\d)/g;

/**
 * Strips sensitive values out of free text before it is written anywhere.
 *
 * Deliberately blunt: it can redact an eleven-digit number that happened not
 * to be a CPF. That trade is the right way round — a slightly less precise
 * error message costs an investigation a few minutes, and a CPF in a log
 * cannot be taken back.
 */
export function redactSensitiveText(text: string): string {
  return text
    .replace(SENSITIVE_ASSIGNMENT, (_match, _quote: string, name: string) => `${name}=${REDACTED}`)
    .replace(JWT, REDACTED)
    .replace(BEARER, `Bearer ${REDACTED}`)
    .replace(CPF_FORMATTED, REDACTED)
    .replace(CPF_BARE, REDACTED);
}
