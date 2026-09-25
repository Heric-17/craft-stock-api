import type { FieldChanges } from './build-field-changes';

/** CLAUDE.md §16: never persist or log a password, its hash, a token, or a CPF. */
const SENSITIVE_FIELD_PATTERN = /password|hash|token|cpf/i;

export function isSensitiveField(fieldName: string): boolean {
  return SENSITIVE_FIELD_PATTERN.test(fieldName);
}

/**
 * Drops sensitive fields entirely from a diff — not masked, absent — so a
 * field never even hints that it changed. Applies uniformly to every model
 * by field name; a new model with a `tokenHash` column is covered with no
 * extra code.
 */
export function omitSensitiveFields(changes: FieldChanges): FieldChanges {
  const result: FieldChanges = {};

  for (const [field, change] of Object.entries(changes)) {
    if (!isSensitiveField(field)) {
      result[field] = change;
    }
  }

  return result;
}
